// AI service: classification, priority scoring, response drafting.
// Design rules:
//  - Ticket is ALWAYS saved before AI processing; AI failure never blocks ticket creation.
//  - Every model output is validated server-side against enums before persisting.
//  - Failed processing is recorded (ai_processing_status='failed') so admins can act manually.
import * as repo from '../repositories/ticketRepository.js';
import { findBookById } from '../repositories/bookRepository.js';
import { findUserById } from '../repositories/userRepository.js';
import { complete, parseJsonOutput, isAiConfigured, AiUnavailableError } from '../ai/geminiClient.js';
import {
  CLASSIFY_SYSTEM, PRIORITY_SYSTEM, PROMPT_VERSION,
  classifyUserPrompt, priorityUserPrompt, draftUserPrompt, draftSystemForCategory,
} from '../ai/prompts.js';
import { TICKET_CATEGORIES, TICKET_PRIORITIES } from '../utils/constants.js';
import { KB_VERSION } from '../ai/knowledgeBase.js';
import { config } from '../config/env.js';
import { notFound } from '../utils/errors.js';
import { z } from 'zod';

const ClassificationOutput = z.object({
  category: z.enum(TICKET_CATEGORIES),
  rationale: z.string().max(500),
}).strict();
const PriorityOutput = z.object({
  priority: z.enum(TICKET_PRIORITIES),
  rationale: z.string().max(500),
}).strict();
const DraftOutput = z.object({
  draft: z.string().trim().min(40).max(8000).refine((draft) => {
    const words = draft.match(/\S+/g)?.length || 0;
    return words >= 80 && words <= 300;
  }),
  used_sections: z.array(z.string()).optional().default([]),
}).strict();

function sanitizeRationale(s, max = 500) {
  if (typeof s !== 'string') return null;
  return s.replace(/[\u0000-\u001F]+/g, ' ').trim().slice(0, max) || null;
}

// ---------- AI output validation (pure, unit-testable) ----------

export function validateClassification(text) {
  const parsed = ClassificationOutput.safeParse(parseJsonOutput(text));
  if (!parsed.success) throw new Error('Model returned an invalid classification schema');
  return { category: parsed.data.category, rationale: sanitizeRationale(parsed.data.rationale) };
}

export function validatePriorityScore(text) {
  const parsed = PriorityOutput.safeParse(parseJsonOutput(text));
  if (!parsed.success) throw new Error('Model returned an invalid priority schema');
  return { priority: parsed.data.priority, rationale: sanitizeRationale(parsed.data.rationale) };
}

export function validateDraftOutput(text) {
  const allowedSections = new Set(['company', 'royalties', 'isbn', 'printing', 'distribution', 'production', 'metadata', 'communication']);
  const parsed = DraftOutput.safeParse(parseJsonOutput(text));
  if (!parsed.success) throw new Error('Model returned an invalid draft schema');
  return {
    draft: parsed.data.draft,
    usedSections: parsed.data.used_sections.filter((section) => allowedSections.has(section)),
  };
}

export function applyPriorityFloor(category, priority, rationale) {
  if (category === 'ISBN & Metadata Issues' && ['Medium', 'Low'].includes(priority)) {
    return {
      priority: 'High',
      rationale: [rationale, 'ISBN and metadata issues are escalated as high priority.'].filter(Boolean).join(' '),
    };
  }
  return { priority, rationale };
}

async function completeAndValidate(options, validator) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await complete({
      ...options,
      system: attempt === 0
        ? options.system
        : `${options.system}\nYour previous response did not match the required JSON schema. Correct the output and return only valid JSON.`,
    });
    try {
      return { value: validator(response.text), model: response.model, usage: response.usage };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function classifyTicket(ticket, book) {
  const { value, usage, model } = await completeAndValidate({
    system: CLASSIFY_SYSTEM,
    user: classifyUserPrompt({ subject: ticket.subject, description: ticket.description, bookTitle: book?.title }),
    maxTokens: 300,
  }, validateClassification);
  const { category, rationale } = value;
  return { category, rationale, model, usage };
}

export async function scorePriority(ticket, book, category) {
  const { value, usage, model } = await completeAndValidate({
    system: PRIORITY_SYSTEM,
    user: priorityUserPrompt({
      subject: ticket.subject, description: ticket.description, category, bookTitle: book?.title,
    }),
    maxTokens: 300,
  }, validatePriorityScore);
  const { priority, rationale } = applyPriorityFloor(category, value.priority, value.rationale);
  return { priority, rationale, model, usage };
}

export async function generateDraft(ticket, book, authorName) {
  const { value, usage, model } = await completeAndValidate({
    system: draftSystemForCategory(ticket.category),
    user: draftUserPrompt({
      authorName,
      subject: ticket.subject,
      description: ticket.description,
      category: ticket.category,
      priority: ticket.priority,
      book,
    }),
    maxTokens: config.ai.maxTokens,
  }, validateDraftOutput);
  const { draft, usedSections } = value;
  return { draft, usedSections, model, usage };
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
    await repo.saveAiClassification(ticketId, {
      category: cls.category,
      categoryRationale: cls.rationale,
      priority: pri.priority,
      priorityRationale: pri.rationale,
      model: cls.model,
      processedAt: new Date(),
      meta: JSON.stringify({
        prompt_version: PROMPT_VERSION,
        kb_version: KB_VERSION,
        classify_usage: cls.usage,
        priority_usage: pri.usage,
      }),
    });
    await repo.insertTicketEvent({ ticketId, event: 'ai_classified', detail: { category: cls.category, priority: pri.priority } });
    return { status: 'complete', category: cls.category, priority: pri.priority };
  } catch (err) {
    const reason = err?.name === 'AiUnavailableError' ? 'AI provider unavailable' : 'AI response could not be processed';
    await repo.updateTicketFields(ticketId, {
      ai_processing_status: 'failed',
      ai_processed_at: new Date(),
      ai_meta: JSON.stringify({ error: reason, prompt_version: PROMPT_VERSION }),
    });
    await repo.insertTicketEvent({ ticketId, event: 'ai_failed', detail: { reason } });
    return { status: 'failed', reason };
  }
}

// On-demand draft generation (admin action). Throws on failure so the UI can show a message.
export async function generateDraftForTicket(ticketId) {
  const ticket = await repo.findTicketById(ticketId);
  if (!ticket) throw notFound('Ticket not found');
  if (!isAiConfigured()) throw new AiUnavailableError('AI is not configured (missing GEMINI_API_KEY). Write the reply manually.');
  const book = ticket.book_id ? await findBookById(ticket.book_id) : null;
  const author = await findUserById(ticket.author_user_id);
  const authorName = author?.name || 'Author';
  const result = await generateDraft(ticket, book, authorName);
  const generatedAt = new Date();
  await repo.saveTicketDraft({
    ticketId,
    body: result.draft,
    model: result.model,
    generatedAt,
  });
  await repo.updateTicketFields(ticketId, {
    ai_meta: JSON.stringify({
      prompt_version: PROMPT_VERSION,
      kb_version: KB_VERSION,
      draft_usage: result.usage,
      used_sections: result.usedSections,
    }),
  });
  await repo.insertTicketEvent({ ticketId, event: 'ai_draft_generated', detail: { model: result.model } });
  return { draft: result.draft, generatedAt, model: result.model };
}

export { AiUnavailableError };
