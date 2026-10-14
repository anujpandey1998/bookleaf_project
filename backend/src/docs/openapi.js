// OpenAPI 3 spec (hand-authored, served at /api/docs and /api/openapi.json).
const bearer = [{ bearerAuth: [] }];

const okEnvelope = (dataSchema, metaSchema) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: dataSchema,
    ...(metaSchema ? { meta: metaSchema } : {}),
  },
});

const errorEnvelope = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    error: {
      type: 'object',
      properties: { message: { type: 'string' }, details: { type: 'array', items: { type: 'object' } } },
    },
  },
};

const ticketCategories = ['Royalty & Payments', 'ISBN & Metadata Issues', 'Printing & Quality', 'Distribution & Availability', 'Book Status & Production Updates', 'General Inquiry'];
const priorities = ['Critical', 'High', 'Medium', 'Low'];
const statuses = ['Open', 'In Progress', 'Resolved', 'Closed'];

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'BookLeaf Publishing — Author Support API',
    version: '1.0.0',
    description: 'Backend for the Author Portal and Admin Portal. JWT auth; role-based access; AI-assisted ticket triage (Anthropic Claude) called only from the backend.',
  },
  servers: [{ url: '/api' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Book: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, bookId: { type: 'string', example: 'BK001' },
          title: { type: 'string' }, isbn: { type: 'string', nullable: true },
          genre: { type: 'string', nullable: true }, publicationDate: { type: 'string', format: 'date', nullable: true },
          status: { type: 'string', example: 'Published & Live' }, isPublished: { type: 'boolean' },
          mrp: { type: 'number', nullable: true }, royaltyPerCopy: { type: 'number', nullable: true },
          totalCopiesSold: { type: 'integer' }, totalRoyaltyEarned: { type: 'number' },
          royaltyPaid: { type: 'number' }, royaltyPending: { type: 'number' },
          lastRoyaltyPayoutDate: { type: 'string', format: 'date', nullable: true },
          printPartner: { type: 'string', nullable: true }, availableOn: { type: 'array', items: { type: 'string' } },
        },
      },
      TicketListItem: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, reference: { type: 'string', example: 'BL-TCK-000001' },
          subject: { type: 'string' }, description: { type: 'string' },
          category: { type: 'string', enum: ticketCategories, nullable: true },
          priority: { type: 'string', enum: priorities, nullable: true },
          status: { type: 'string', enum: statuses },
          bookTitle: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    '/auth/login': {
      post: {
        summary: 'Email/password login (rate limited)',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } } } } },
        responses: {
          200: { description: 'JWT + safe user object (never includes password hash)', content: { 'application/json': { schema: okEnvelope({ type: 'object', properties: { token: { type: 'string' }, user: { type: 'object' } } }) } } },
          401: { description: 'Invalid credentials', content: { 'application/json': { schema: errorEnvelope } } },
        },
      },
    },
    '/auth/me': { get: { summary: 'Current user', security: bearer, responses: { 200: { description: 'OK' }, 401: { description: 'Unauthorized' } } } },
    '/author/dashboard': { get: { summary: 'Author dashboard metrics (books, royalties, tickets)', security: bearer, responses: { 200: { description: 'OK' }, 403: { description: 'Not an author' } } } },
    '/author/books': { get: { summary: 'Books owned by the logged-in author', security: bearer, responses: { 200: { description: 'OK', content: { 'application/json': { schema: okEnvelope({ type: 'array', items: { $ref: '#/components/schemas/Book' } }) } } } } } },
    '/author/tickets': {
      get: { summary: 'List own tickets', security: bearer, responses: { 200: { description: 'OK', content: { 'application/json': { schema: okEnvelope({ type: 'array', items: { $ref: '#/components/schemas/TicketListItem' } }) } } } } },
      post: {
        summary: 'Create support ticket (AI triage runs asynchronously after save; creation never fails due to AI)',
        security: bearer,
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['subject', 'description'], properties: { bookId: { type: 'integer', nullable: true, description: 'null = General / Account Level' }, subject: { type: 'string', minLength: 3, maxLength: 200 }, description: { type: 'string', minLength: 10, maxLength: 8000 }, attachmentName: { type: 'string', nullable: true } } } } } },
        responses: { 201: { description: 'Created' }, 400: { description: 'Validation failed' }, 403: { description: 'Book belongs to another author' } },
      },
    },
    '/author/tickets/{id}': { get: { summary: 'Ticket detail with public messages only (internal notes are filtered in SQL)', security: bearer, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' }, 403: { description: 'Not your ticket' }, 404: { description: 'Not found' } } } },
    '/author/tickets/{id}/events': { get: { summary: 'SSE stream of new replies/status changes (EventSource; token via ?token=)', security: bearer, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'text/event-stream' } } } },
    '/admin/dashboard': { get: { summary: 'Queue metrics', security: bearer, responses: { 200: { description: 'OK' }, 403: { description: 'Admin only' } } } },
    '/admin/tickets': {
      get: {
        summary: 'Paginated, filterable, searchable ticket queue across all authors',
        security: bearer,
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: statuses } },
          { name: 'category', in: 'query', schema: { type: 'string', enum: ticketCategories } },
          { name: 'priority', in: 'query', schema: { type: 'string', enum: priorities } },
          { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['updated_desc', 'updated_asc', 'created_desc', 'created_asc', 'oldest_unresolved', 'priority_first'] } },
        ],
        responses: { 200: { description: 'OK with pagination meta' } },
      },
    },
    '/admin/tickets/{id}': {
      get: { summary: 'Full ticket detail incl. internal notes, AI metadata, audit events', security: bearer, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } },
      patch: {
        summary: 'Override category/priority, change status (lifecycle enforced), assign to self, save draft (never sends)',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', enum: statuses }, category: { type: 'string', enum: ticketCategories }, priority: { type: 'string', enum: priorities }, assignToMe: { type: 'boolean' }, aiDraft: { type: 'string', nullable: true } } } } } },
        responses: { 200: { description: 'Updated' }, 400: { description: 'Invalid transition or validation error' } },
      },
    },
    '/admin/tickets/{id}/notes': { post: { summary: 'Add internal note (admins only, never visible to authors)', security: bearer, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 201: { description: 'Created' } } } },
    '/admin/tickets/{id}/ai-draft': { post: { summary: 'Generate/regenerate KB-grounded AI reply draft (rate limited; 502/503 on provider failure)', security: bearer, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Draft saved' }, 502: { description: 'AI output invalid/provider error' }, 503: { description: 'AI unavailable' } } } },
    '/admin/tickets/{id}/messages': { post: { summary: 'Send public reply (persists message, bumps ticket timestamp, notifies author via SSE)', security: bearer, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 201: { description: 'Sent' } } } },
  },
};
