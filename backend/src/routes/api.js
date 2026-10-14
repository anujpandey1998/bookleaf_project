import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as ctrl from '../controllers/ticketController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  loginSchema, createTicketSchema, adminUpdateTicketSchema,
  noteSchema, replySchema, ticketQueueQuerySchema, idParamSchema,
} from '../validators/schemas.js';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many login attempts, please try again later' } },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'AI endpoint rate limit reached, try again in a minute' } },
});

export const router = Router();

// ---- auth ----
router.post('/auth/login', authLimiter, validate(loginSchema), ctrl.login);
router.get('/auth/me', requireAuth, ctrl.me);

// ---- author ----
router.get('/author/dashboard', requireAuth, requireRole('author'), ctrl.authorDashboard);
router.get('/author/books', requireAuth, requireRole('author'), ctrl.authorBooks);
router.get('/author/tickets', requireAuth, requireRole('author'), ctrl.authorTickets);
router.post('/author/tickets', requireAuth, requireRole('author'), validate(createTicketSchema), ctrl.authorCreateTicket);
router.get('/author/tickets/:id', requireAuth, requireRole('author'), validate(idParamSchema, 'params'), ctrl.authorTicketDetail);
// SSE stream — EventSource cannot set Authorization headers, so requireAuth also accepts
// ?token=<jwt> (used only by this endpoint's clients; still fully validated + ownership-checked).
router.get('/author/tickets/:id/events', requireAuth, ctrl.authorTicketEvents);

// ---- admin ----
router.get('/admin/dashboard', requireAuth, requireRole('admin'), ctrl.adminDashboard);
router.get('/admin/tickets', requireAuth, requireRole('admin'), validate(ticketQueueQuerySchema, 'query'), ctrl.adminTickets);
router.get('/admin/tickets/:id', requireAuth, requireRole('admin'), validate(idParamSchema, 'params'), ctrl.adminTicketDetail);
router.patch('/admin/tickets/:id', requireAuth, requireRole('admin'), validate(idParamSchema, 'params'), validate(adminUpdateTicketSchema), ctrl.adminUpdateTicket);
router.post('/admin/tickets/:id/notes', requireAuth, requireRole('admin'), validate(idParamSchema, 'params'), validate(noteSchema), ctrl.adminAddNote);
router.post('/admin/tickets/:id/ai-draft', requireAuth, requireRole('admin'), aiLimiter, validate(idParamSchema, 'params'), ctrl.adminGenerateDraft);
router.post('/admin/tickets/:id/messages', requireAuth, requireRole('admin'), validate(idParamSchema, 'params'), validate(replySchema), ctrl.adminSendMessage);
