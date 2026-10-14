// AI service: classification, priority scoring, response drafting.
// Design rules:
//  - Ticket is ALWAYS saved before AI processing; AI failure never blocks ticket creation.
//  - Every model output is validated server-side against enums before persisting.
//  - Failed processing is recorded (ai_processing_status='failed') so admins can act manually.
import * as repo from '../repositories/ticketRepository.js';
import { findBookById } from '../repositories/bookRepository.js';
import { complete, parseJsonOutput, isAiConfigured, AiUnavailableError } from '../ai/claudeClient.js';
import {
  CLASSIFY_SYSTEM, PRIORITY_SYSTEM, DRAFT_SYSTEM, PROMPT_VERSION,
  classifyUserPrompt, priorityUserPrompt, draftUserPrompt,
} from '../ai/prompts.js';
import { TICKET_CATEGORIES, TICKET_PRIORITIES } from '../utils/constants.js';
import { KB_VERSION } from '../ai/knowledgeBase.js';
import { config } from '../config/env.js';
import { notFound } from '../utils/errors.js';

function sanitizeRationale(s, max = 500) {
  if (typeof s !== 'string') return null;
  return s.replace(/[\u0000-\u001F]+/g, ' ').trim().slice(0, max) || null;
}

export async function classifyTicket(ticket, book) {
  const { text, usage, model } = await complete({
    system: CLASSIFY_SYSTEM,
    user: classifyUserPrompt({ subject: ticket.subject, description: ticket.description, bookTitle: book?.title }),
    maxTokens: 300,
  });
  const parsed = parseJsonOutput(text);
  const category = parsed?.category;
  if (!TICKET_CATEGORIES.includes(category)) {
    throw new Error(`Invalid category returned by model: ${JSON.stringify(category)?.slice(0, 80)}`);
  }
  return {
    category,
    rationale: sanitizeRationale(parsed.rationale),
    model,
    usage,
  };
}

export async function scorePriority(ticket, book, category) {
  const { text, usage, model } = await complete({
    system: PRIORITY_SYSTEM,
    user: priorityUserPrompt({
      subject: ticket.subject, description: ticket.description, category, bookTitle: book?.title,
    }),
    maxTokens: 300,
  });
  const parsed = parseJsonOutput(text);
  const priority = parsed?.priority;
  if (!TICKET_PRIORITIES.includes(priority)) {
    throw new Error(`Invalid priority returned by model: ${JSON.stringify(priority)?.slice(0, 80)}`);
  }
  return { priority, rationale: sanitizeRationale(parsed.rationale), model, usage };
}

export async function generateDraft(ticket, book, authorName) {
  const { text, usage, model } = await complete({
    system: DRAFT_SYSTEM,
    user: draftUserPrompt({
      authorName,
      subject: ticket.subject,
      description: ticket.description,
      category: ticket.category,
      priority: ticket.priority,
      book,
    }),
    maxTokens: config.ai.maxTokens,
  });
  const parsed = parseJsonOutput(text);
  const draft = typeof parsed?.draft === 'string' ? parsed.draft.trim() : null;
  if (!draft || draft.length < 40) throw new Error('Model returned an empty or too-short draft');
  return { draft: draft.slice(0, 8000), usedSections: Array.isArray(parsed.used_sections) ? parsed.used_sections : [], model, usage };
}

// Post-creation hook: runs classification + priority scoring, persists results,
// never throws — records failure instead so ticket creation succeeds regardless.
export async function processNewTicket(ticketId) {
  if (!isAiConfigured()) {
    await repo.updateTicketFields(ticketId, { ai_processing_status: 'skipped' });
    return { status: 'skipped', reason: 'AI not configured' };
  }
  const ticket = await repo.findTicketById(ticketId);
  if (!ticket) return { status: 'missing' };
  const book = ticket.book_id ? await findBookById(ticket.book_id) : null;
  try {
    const cls = await classifyTicket(ticket, book);
    const pri = await scorePriority(ticket, book, cls.category);
    await repo.updateTicketFields(ticketId, {
      category: cls.category,
      category_source: 'ai',
      category_rationale: cls.rationale,
      priority: pri.priority,
      priority_source: 'ai',
      priority_rationale: pri.rationale,
      ai_processing_status: 'complete',
      ai_model: cls.model,
      ai_processed_at: new Date(),
      ai_meta: JSON.stringify({
        prompt_version: PROMPT_VERSION,
        kb_version: KB_VERSION,
        classify_usage: cls.usage,
        priority_usage: pri.usage,
      }),
    });
    await repo.insertTicketEvent({ ticketId, event: 'ai_classified', detail: { category: cls.category, priority: pri.priority } });
    return { status: 'complete', category: cls.category, priority: pri.priority };
  } catch (err) {
    await repo.updateTicketFields(ticketId, {
      ai_processing_status: 'failed',
      ai_processed_at: new Date(),
      ai_meta: JSON.stringify({ error: String(err.message).slice(0, 300), prompt_version: PROMPT_VERSION }),
    });
    await repo.insertTicketEvent({ ticketId, event: 'ai_failed', detail: { reason: String(err.message).slice(0, 200) } });
    return { status: 'failed', reason: err.message };
  }
}

// On-demand draft generation (admin action). Throws on failure so the UI can show a message.
export async function generateDraftForTicket(ticketId) {
  const ticket = await repo.findTicketById(ticketId);
  if (!ticket) throw notFound('Ticket not found');
  if (!isAiConfigured()) throw new AiUnavailableError('AI is not configured (missing ANTHROPIC_API_KEY). Write the reply manually.');
  const book = ticket.book_id ? await findBookById(ticket.book_id) : null;
  const authorName = ticket.author_name || 'Author';
  const full = await repo.findTicketById(ticketId);
  const result = await generateDraft(full, book, authorName);
  await repo.updateTicketFields(ticketId, {
    ai_draft: result.draft,
    ai_draft_generated_at: new Date(),
    ai_meta: JSON.stringify({
      prompt_version: PROMPT_VERSION,
      kb_version: KB_VERSION,
      draft_usage: result.usage,
      used_sections: result.usedSections,
    }),
  });
  await repo.insertTicketEvent({ ticketId, event: 'ai_draft_generated', detail: { model: result.model } });
  return { draft: result.draft, generatedAt: new Date(), model: result.model };
}

export { AiUnavailableError };
