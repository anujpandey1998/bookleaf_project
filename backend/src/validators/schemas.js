import { z } from 'zod';
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from '../utils/constants.js';

export const loginSchema = z.object({
  email: z.string().trim().email('A valid email is required').max(190),
  password: z.string().min(1, 'Password is required').max(200),
});

export const signupSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(150),
  email: z.string().trim().email('A valid email is required').max(190),
  password: z.string().min(10, 'Password must be at least 10 characters').max(200),
});

export const createTicketSchema = z.object({
  bookId: z.coerce.number().int().positive().nullable().optional(), // null/absent = General / Account Level
  subject: z.string().trim().min(3, 'Subject must be at least 3 characters').max(200),
  description: z.string().trim().min(10, 'Please describe your issue in at least 10 characters').max(8000),
  attachmentName: z.string().trim().max(200).optional().nullable(),
});

export const adminUpdateTicketSchema = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
    category: z.enum(TICKET_CATEGORIES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    assignToMe: z.boolean().optional(),
    aiDraft: z.string().trim().max(8000).nullable().optional(), // save/edit draft (does NOT send)
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field is required' });

export const noteSchema = z.object({
  body: z.string().trim().min(1, 'Note body is required').max(8000),
});

export const replySchema = z.object({
  body: z.string().trim().min(1, 'Message body is required').max(8000),
});

export const ticketQueueQuerySchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z
    .enum(['updated_desc', 'updated_asc', 'created_desc', 'created_asc', 'oldest_unresolved', 'priority_first'])
    .default('priority_first'),
});

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
