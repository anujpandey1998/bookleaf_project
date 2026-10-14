import { asyncHandler } from '../utils/asyncHandler.js';
import * as authService from '../services/authService.js';
import * as bookRepo from '../repositories/bookRepository.js';
import * as ticketService from '../services/ticketService.js';
import * as ticketRepo from '../repositories/ticketRepository.js';
import { ok, created } from '../utils/respond.js';
import { notFound, forbidden } from '../utils/errors.js';
import { addSubscriber } from '../services/sseService.js';
import { generateDraftForTicket } from '../services/aiService.js';
import { AiUnavailableError } from '../ai/claudeClient.js';
import { AppError } from '../utils/errors.js';

// ---------- auth ----------
export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  return ok(res, result);
});

export const me = asyncHandler(async (req, res) => ok(res, req.user));

// ---------- author ----------
export const authorDashboard = asyncHandler(async (req, res) => {
  const data = await ticketService.getAuthorDashboard(req.user.id);
  return ok(res, {
    books: {
      totalBooks: Number(data.summary.total_books),
      publishedBooks: Number(data.summary.published_books || 0),
      inProductionBooks: Number(data.summary.in_production_books || 0),
      totalCopiesSold: Number(data.summary.total_copies_sold || 0),
      totalRoyaltyEarned: Number(data.summary.total_royalty_earned || 0),
      royaltyPaid: Number(data.summary.royalty_paid || 0),
      royaltyPending: Number(data.summary.royalty_pending || 0),
    },
    tickets: data.ticketCounts,
  });
});

export const authorBooks = asyncHandler(async (req, res) => {
  const books = await bookRepo.listBooksByAuthor(req.user.id);
  return ok(res, books.map(ticketService.shapeBookPublic));
});

export const authorTickets = asyncHandler(async (req, res) => {
  const tickets = await ticketService.getAuthorTickets(req.user.id);
  return ok(res, tickets.map(ticketService.shapeTicketListItem));
});

export const authorCreateTicket = asyncHandler(async (req, res) => {
  const { bookId, subject, description, attachmentName } = req.body;
  const ticket = await ticketService.createTicket({
    authorUserId: req.user.id,
    bookId: bookId ?? null,
    subject,
    description,
    attachmentName: attachmentName ?? null,
  });
  return created(res, ticketService.shapeTicketListItem(ticket));
});

export const authorTicketDetail = asyncHandler(async (req, res) => {
  const { ticket, messages } = await ticketService.getAuthorTicketDetail(req.params.id, req.user.id);
  return ok(res, ticketService.shapeTicketAuthorDetail(ticket, messages));
});

// SSE stream for a single ticket the author owns.
export const authorTicketEvents = asyncHandler(async (req, res) => {
  // Ownership check BEFORE opening the stream.
  const t = await ticketRepo.findTicketById(req.params.id);
  if (!t) throw notFound('Ticket not found');
  if (t.author_user_id !== req.user.id && req.user.role !== 'admin') {
    throw forbidden('This ticket belongs to another author');
  }
  addSubscriber(t.id, req.user.id, req.user.role, res);
});

// ---------- admin ----------
export const adminDashboard = asyncHandler(async (req, res) => {
  const s = await ticketRepo.getAdminTicketStats();
  return ok(res, {
    totalTickets: Number(s.total),
    openTickets: Number(s.open || 0),
    inProgressTickets: Number(s.in_progress || 0),
    resolvedTickets: Number(s.resolved || 0),
    closedTickets: Number(s.closed || 0),
    criticalHighUnresolved: Number(s.critical_high_open || 0),
    criticalUnresolved: Number(s.critical_open || 0),
  });
});

export const adminTickets = asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const { rows, total, page, limit } = await ticketRepo.listTicketsAdmin(q);
  return ok(
    res,
    rows.map((t) => ({
      ...ticketService.shapeTicketListItem(t),
      authorName: t.author_name,
      authorEmail: t.author_email,
      assignedAdminName: t.assigned_admin_name,
    })),
    { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
  );
});

export const adminTicketDetail = asyncHandler(async (req, res) => {
  const data = await ticketService.getAdminTicket(req.params.id);
  return ok(res, data);
});

export const adminUpdateTicket = asyncHandler(async (req, res) => {
  const updated = await ticketService.updateTicketByAdmin({
    ticketId: req.params.id,
    adminUser: req.user,
    changes: req.body,
  });
  return ok(res, ticketService.shapeTicketListItem(updated));
});

export const adminAddNote = asyncHandler(async (req, res) => {
  const id = await ticketService.addInternalNote({
    ticketId: req.params.id,
    adminUser: req.user,
    body: req.body.body,
  });
  return created(res, { id, kind: 'internal_note' });
});

export const adminGenerateDraft = asyncHandler(async (req, res) => {
  try {
    const draft = await generateDraftForTicket(req.params.id);
    return ok(res, draft);
  } catch (err) {
    if (err instanceof AiUnavailableError) throw new AppError(503, err.message);
    throw new AppError(502, `AI draft generation failed: ${String(err.message).slice(0, 200)}`);
  }
});

export const adminSendMessage = asyncHandler(async (req, res) => {
  const id = await ticketService.sendPublicReply({
    ticketId: req.params.id,
    adminUser: req.user,
    body: req.body.body,
  });
  return created(res, { id, kind: 'public_reply', sentAt: new Date() });
});
