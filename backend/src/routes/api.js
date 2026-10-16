import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as ctrl from '../controllers/ticketController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ROLES } from '../utils/constants.js';
import { validate } from '../middleware/validate.js';
import { uploadTicketFiles } from '../middleware/fileUploads.js';
import {
  loginSchema, signupSchema, createTicketSchema, adminUpdateTicketSchema,
  noteSchema, replySchema, ticketQueueQuerySchema, idParamSchema,
} from '../validators/schemas.js';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many login attempts, please try again later' },
  }),
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({
    success: false,
    error: { code: 'RATE_LIMITED', message: 'AI endpoint rate limit reached, try again in a minute' },
  }),
});

export const router = Router();

// ---- auth ----
router.post('/auth/login', authLimiter, validate(loginSchema), ctrl.login);
router.post('/auth/signup', authLimiter, validate(signupSchema), ctrl.signup);
router.post('/auth/logout', ctrl.logout);
router.get('/auth/me', requireAuth, ctrl.me);

// ---- author ----
router.get('/author/dashboard', requireAuth, requireRole(ROLES.AUTHOR), ctrl.authorDashboard);
router.get('/author/books', requireAuth, requireRole(ROLES.AUTHOR), ctrl.authorBooks);
router.get('/author/tickets', requireAuth, requireRole(ROLES.AUTHOR), ctrl.authorTickets);
router.post('/author/tickets', requireAuth, requireRole(ROLES.AUTHOR), validate(createTicketSchema), ctrl.authorCreateTicket);
router.get('/author/tickets/:id', requireAuth, requireRole(ROLES.AUTHOR), validate(idParamSchema, 'params'), ctrl.authorTicketDetail);
router.post('/author/tickets/:id/attachments', requireAuth, requireRole(ROLES.AUTHOR), validate(idParamSchema, 'params'), uploadTicketFiles.array('files', 5), ctrl.uploadTicketAttachments);
// The frontend uses fetch streaming so the HttpOnly auth cookie is sent without a URL token.
router.get('/author/tickets/:id/events', requireAuth, validate(idParamSchema, 'params'), ctrl.authorTicketEvents);
router.post('/author/tickets/:id/messages', requireAuth, requireRole(ROLES.AUTHOR), validate(idParamSchema, 'params'), validate(replySchema), ctrl.authorSendMessage);

// ---- admin ----
router.get('/admin/dashboard', requireAuth, requireRole(ROLES.ADMIN), ctrl.adminDashboard);
router.get('/admin/tickets', requireAuth, requireRole(ROLES.ADMIN), validate(ticketQueueQuerySchema, 'query'), ctrl.adminTickets);
router.get('/admin/tickets/:id', requireAuth, requireRole(ROLES.ADMIN), validate(idParamSchema, 'params'), ctrl.adminTicketDetail);
router.post('/admin/tickets/:id/attachments', requireAuth, requireRole(ROLES.ADMIN), validate(idParamSchema, 'params'), uploadTicketFiles.array('files', 5), ctrl.uploadTicketAttachments);
router.patch('/admin/tickets/:id', requireAuth, requireRole(ROLES.ADMIN), validate(idParamSchema, 'params'), validate(adminUpdateTicketSchema), ctrl.adminUpdateTicket);
router.post('/admin/tickets/:id/notes', requireAuth, requireRole(ROLES.ADMIN), validate(idParamSchema, 'params'), validate(noteSchema), ctrl.adminAddNote);
router.post('/admin/tickets/:id/ai-draft', requireAuth, requireRole(ROLES.ADMIN), aiLimiter, validate(idParamSchema, 'params'), ctrl.adminGenerateDraft);
router.post('/admin/tickets/:id/messages', requireAuth, requireRole(ROLES.ADMIN), validate(idParamSchema, 'params'), validate(replySchema), ctrl.adminSendMessage);
router.get('/ticket-attachments/:id', requireAuth, requireRole(ROLES.AUTHOR, ROLES.ADMIN), validate(idParamSchema, 'params'), ctrl.downloadTicketAttachment);
