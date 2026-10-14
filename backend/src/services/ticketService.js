import * as repo from '../repositories/ticketRepository.js';
import { findBookById, getAuthorRoyaltySummary } from '../repositories/bookRepository.js';
import { findUserById } from '../repositories/userRepository.js';
import { processNewTicket } from './aiService.js';
import { broadcast } from './sseService.js';
import { isValidTransition } from '../utils/constants.js';
import { notFound, forbidden, badRequest } from '../utils/errors.js';

// ---------- shaping (never leak private fields) ----------

export function shapeBookPublic(b) {
  return {
    id: b.id,
    bookId: b.book_id,
    title: b.title,
    isbn: b.isbn,
    genre: b.genre,
    publicationDate: b.publication_date,
    status: b.status,
    isPublished: Boolean(b.is_published),
    mrp: b.mrp === null ? null : Number(b.mrp),
    royaltyPerCopy: b.author_royalty_per_copy === null ? null : Number(b.author_royalty_per_copy),
    totalCopiesSold: b.total_copies_sold,
    totalRoyaltyEarned: Number(b.total_royalty_earned),
    royaltyPaid: Number(b.royalty_paid),
    royaltyPending: Number(b.royalty_pending),
    lastRoyaltyPayoutDate: b.last_royalty_payout_date,
    printPartner: b.print_partner,
    availableOn: typeof b.available_on === 'string' ? JSON.parse(b.available_on) : (b.available_on || []),
  };
}

export function shapeTicketListItem(t) {
  return {
    id: t.id,
    reference: t.reference,
    subject: t.subject,
    description: t.description, // original query — authors must see it
    category: t.category,
    priority: t.priority,
    status: t.status,
    bookId: t.book_id,
    bookTitle: t.book_title || null,
    bookCode: t.book_code || null,
    attachmentName: t.attachment_name,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

// Author view of a ticket detail: NO internal notes, NO admin-only fields like rationale/assigned admin/drafts.
export function shapeTicketAuthorDetail(t, messages) {
  return {
    ...shapeTicketListItem(t),
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      senderName: m.sender_name,
      senderRole: m.sender_role,
      createdAt: m.created_at,
    })),
  };
}

// Admin view: everything including internal notes, AI metadata, events. Still no password data anywhere.
export function shapeTicketAdminDetail(t, messages, events) {
  return {
    id: t.id,
    reference: t.reference,
    subject: t.subject,
    description: t.description,
    attachmentName: t.attachment_name,
    status: t.status,
    category: t.category,
    categorySource: t.category_source,
    categoryRationale: t.category_rationale,
    priority: t.priority,
    prioritySource: t.priority_source,
    priorityRationale: t.priority_rationale,
    aiDraft: t.ai_draft,
    aiDraftGeneratedAt: t.ai_draft_generated_at,
    aiProcessingStatus: t.ai_processing_status,
    aiModel: t.ai_model,
    assignedAdmin: t.assigned_admin_id ? { id: t.assigned_admin_id } : null, // enriched by caller
    author: null, // filled by caller
    book: null,   // filled by caller
    messages: messages.map((m) => ({
      id: m.id,
      kind: m.kind,
      body: m.body,
      senderId: m.sender_user_id,
      senderName: m.sender_name,
      senderRole: m.sender_role,
      visibleToAuthor: Boolean(m.visible_to_author),
      createdAt: m.created_at,
    })),
    events: (events || []).map((e) => ({
      id: e.id,
      event: e.event,
      actor: e.actor_name || 'System',
      detail: typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail,
      createdAt: e.created_at,
    })),
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

// ---------- author operations ----------

export async function createTicket({ authorUserId, bookId, subject, description, attachmentName }) {
  // Ownership enforced server-side: if a bookId is supplied it MUST belong to this author.
  let book = null;
  if (bookId) {
    book = await findBookById(bookId);
    if (!book) throw notFound('Selected book not found');
    if (book.author_user_id !== authorUserId) throw forbidden('You can only attach your own books to tickets');
  }
  const reference = await repo.nextTicketReference();
  const ticketId = await repo.insertTicket({
    reference, authorUserId, bookId: book?.id ?? null, subject, description, attachmentName,
  });
  await repo.insertTicketEvent({ ticketId, actorUserId: authorUserId, event: 'created' });

  // Fire-and-forget AI processing AFTER the ticket is safely persisted.
  processNewTicket(ticketId).catch(() => {});

  return repo.findTicketById(ticketId);
}

export async function getAuthorTickets(authorUserId) {
  return repo.listTicketsByAuthor(authorUserId);
}

export async function getAuthorTicketDetail(ticketId, authorUserId) {
  const t = await repo.findTicketById(ticketId);
  if (!t) throw notFound('Ticket not found');
  if (t.author_user_id !== authorUserId) throw forbidden('This ticket belongs to another author');
  const messages = await repo.listMessages(ticketId, { authorView: true }); // filters internal notes in SQL
  return { ticket: t, messages };
}

export async function getAuthorDashboard(authorUserId) {
  const [summary, tickets] = await Promise.all([
    getAuthorRoyaltySummary(authorUserId),
    repo.listTicketsByAuthor(authorUserId),
  ]);
  const counts = { total: 0, open: 0, inProgress: 0, resolved: 0, closed: 0 };
  for (const tk of tickets) {
    counts.total += 1;
    if (tk.status === 'Open') counts.open += 1;
    else if (tk.status === 'In Progress') counts.inProgress += 1;
    else if (tk.status === 'Resolved') counts.resolved += 1;
    else if (tk.status === 'Closed') counts.closed += 1;
  }
  return { summary, ticketCounts: counts };
}

// ---------- admin operations ----------

export async function getAdminTicket(id) {
  const t = await repo.findTicketById(id);
  if (!t) throw notFound('Ticket not found');
  const [messages, events, author, book] = await Promise.all([
    repo.listMessages(t.id, { authorView: false }),
    repo.listTicketEvents(t.id),
    findUserById(t.author_user_id),
    t.book_id ? findBookById(t.book_id) : null,
  ]);
  const shaped = shapeTicketAdminDetail(t, messages, events);
  shaped.author = author;
  shaped.book = book ? shapeBookPublic(book) : null;
  if (t.assigned_admin_id) {
    const adminUser = await findUserById(t.assigned_admin_id);
    shaped.assignedAdmin = adminUser ? { id: adminUser.id, name: adminUser.name, email: adminUser.email } : { id: t.assigned_admin_id };
  } else {
    shaped.assignedAdmin = null;
  }
  return shaped;
}

export async function updateTicketByAdmin({ ticketId, adminUser, changes }) {
  const t = await repo.findTicketById(ticketId);
  if (!t) throw notFound('Ticket not found');
  const fields = {};
  const events = [];

  if (changes.status && changes.status !== t.status) {
    if (!isValidTransition(t.status, changes.status)) {
      throw badRequest(`Invalid status transition: ${t.status} → ${changes.status}`);
    }
    fields.status = changes.status;
    events.push({ event: 'status_changed', detail: { from: t.status, to: changes.status } });
  }
  if (changes.category && changes.category !== t.category) {
    fields.category = changes.category;
    fields.category_source = 'manual';
    events.push({ event: 'category_overridden', detail: { from: t.category, to: changes.category } });
  }
  if (changes.priority && changes.priority !== t.priority) {
    fields.priority = changes.priority;
    fields.priority_source = 'manual';
    events.push({ event: 'priority_overridden', detail: { from: t.priority, to: changes.priority } });
  }
  if (changes.assignToMe) {
    fields.assigned_admin_id = adminUser.id;
    // Assigning work implies active handling; auto-move Open -> In Progress.
    if (t.status === 'Open') {
      fields.status = 'In Progress';
      events.push({ event: 'status_changed', detail: { from: 'Open', to: 'In Progress', reason: 'auto on assignment' } });
    }
    events.push({ event: 'assigned', detail: { adminId: adminUser.id, adminName: adminUser.name } });
  }
  if ('aiDraft' in changes) {
    fields.ai_draft = changes.aiDraft; // saving a draft NEVER sends it
    events.push({ event: 'draft_saved' });
  }

  await repo.updateTicketFields(ticketId, fields);
  for (const e of events) {
    await repo.insertTicketEvent({ ticketId, actorUserId: adminUser.id, event: e.event, detail: e.detail });
  }
  if (fields.status) {
    broadcast(ticketId, 'status', { status: fields.status });
  }
  return repo.findTicketById(ticketId);
}

export async function addInternalNote({ ticketId, adminUser, body }) {
  const t = await repo.findTicketById(ticketId);
  if (!t) throw notFound('Ticket not found');
  const messageId = await repo.insertMessage({ ticketId, senderUserId: adminUser.id, kind: 'internal_note', body });
  await repo.insertTicketEvent({ ticketId, actorUserId: adminUser.id, event: 'note_added' });
  // Internal notes are NOT broadcast to authors and have visible_to_author = 0.
  return messageId;
}

export async function sendPublicReply({ ticketId, adminUser, body }) {
  const t = await repo.findTicketById(ticketId);
  if (!t) throw notFound('Ticket not found');
  const messageId = await repo.insertMessage({ ticketId, senderUserId: adminUser.id, kind: 'public_reply', body });
  await repo.updateTicketFields(ticketId, {}); // bumps updated_at so queue ordering reflects the reply
  await repo.insertTicketEvent({ ticketId, actorUserId: adminUser.id, event: 'reply_sent' });
  // Notify connected author clients in real time.
  broadcast(ticketId, 'message', {
    id: messageId,
    body,
    senderName: adminUser.name,
    senderRole: 'admin',
    createdAt: new Date(),
  });
  return messageId;
}
