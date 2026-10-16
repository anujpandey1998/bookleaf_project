// OpenAPI 3 spec served at /api/docs and /api/openapi.json.
const session = [{ sessionCookie: [] }];
const categories = [
  'Royalty & Payments', 'ISBN & Metadata Issues', 'Printing & Quality',
  'Distribution & Availability', 'Book Status & Production Updates', 'General Inquiry',
];
const priorities = ['Critical', 'High', 'Medium', 'Low'];
const statuses = ['Open', 'In Progress', 'Resolved', 'Closed'];
const idParameter = { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } };
const errorResponse = {
  description: 'Standard error envelope',
  content: { 'application/json': { schema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      error: { type: 'object', properties: {
        code: { type: 'string', example: 'UNAUTHORIZED' },
        message: { type: 'string' },
        details: { type: 'array', items: { type: 'object' } },
      } },
    },
  } } },
};
const multipartUploadRequestBody = {
  required: true,
  content: {
    'multipart/form-data': {
      schema: {
        type: 'object',
        properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } },
      },
    },
  },
};

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'BookLeaf Publishing — Author Support API',
    version: '1.0.0',
    description: 'Versioned REST API for the Author and Admin portals. JWT sessions use an HttpOnly cookie; optional Google Gemini triage and drafts are generated only on the backend.',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      sessionCookie: { type: 'apiKey', in: 'cookie', name: 'bookleaf_session', description: 'HttpOnly session cookie set by POST /auth/login.' },
    },
    schemas: {
      Book: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, bookId: { type: 'string' }, title: { type: 'string' },
          isbn: { type: 'string', nullable: true }, genre: { type: 'string', nullable: true },
          publicationDate: { type: 'string', format: 'date', nullable: true },
          status: { type: 'string' }, isPublished: { type: 'boolean' },
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
          category: { type: 'string', enum: categories, nullable: true },
          priority: { type: 'string', enum: priorities, nullable: true },
          status: { type: 'string', enum: statuses },
          bookTitle: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
        },
        TicketAttachment: {
          type: 'object',
          properties: {
            id: { type: 'integer' }, name: { type: 'string' }, mimeType: { type: 'string' },
            sizeBytes: { type: 'integer' }, createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'object', required: ['code', 'message'], properties: {
            code: { type: 'string' }, message: { type: 'string' }, details: { type: 'array', items: { type: 'object' } },
          } },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Health check, including a MySQL connectivity query',
        responses: {
          200: { description: 'API and database are available', content: { 'application/json': { example: { success: true, data: { status: 'ok', database: 'ok', time: '2026-10-16T10:00:00.000Z' } } } } },
          503: errorResponse,
        },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Sign in and set the HttpOnly session cookie (rate limited)',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } },
        } } } },
        responses: {
          200: { description: 'Authenticated; response includes only the safe user object. JWT is set as an HttpOnly cookie.' },
          401: errorResponse, 429: errorResponse,
        },
      },
      '/auth/signup': {
        post: {
          summary: 'Create an author account and set the HttpOnly session cookie (rate limited)',
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['name', 'email', 'password'], properties: {
              name: { type: 'string', minLength: 2, maxLength: 150 },
              email: { type: 'string', format: 'email', maxLength: 190 },
              password: { type: 'string', minLength: 10, maxLength: 200 },
            },
          } } } },
          responses: {
            201: { description: 'Author account created; response contains a safe user object and JWT is set as an HttpOnly cookie.' },
            400: errorResponse, 409: errorResponse, 429: errorResponse,
          },
        },
      },
    },
    '/auth/logout': { post: { summary: 'Clear the session cookie', responses: { 200: { description: 'Session cookie cleared' } } } },
    '/auth/me': { get: { summary: 'Current authenticated user', security: session, responses: { 200: { description: 'Safe user object' }, 401: errorResponse } } },
    '/author/dashboard': { get: { summary: 'Author book, royalty and ticket metrics', security: session, responses: { 200: { description: 'Dashboard metrics' }, 403: errorResponse } } },
    '/author/books': { get: { summary: 'List books belonging to the current author', security: session, responses: { 200: { description: 'Book list' }, 403: errorResponse } } },
    '/author/tickets': {
      get: { summary: 'List own tickets', security: session, responses: { 200: { description: 'Ticket list' } } },
      post: {
        summary: 'Create ticket (AI triage runs asynchronously; ticket creation does not depend on AI)',
        security: session,
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['subject', 'description'], properties: {
            bookId: { type: 'integer', nullable: true, description: 'Omit or set null for general/account-level issues.' },
            subject: { type: 'string', minLength: 3, maxLength: 200 },
            description: { type: 'string', minLength: 10, maxLength: 8000 },
          },
        } } } },
        responses: { 201: { description: 'Ticket created' }, 400: errorResponse, 403: errorResponse },
      },
    },
    '/author/tickets/{id}': { get: { summary: 'Own ticket and public replies only; internal notes are excluded', security: session, parameters: [idParameter], responses: { 200: { description: 'Ticket detail' }, 403: errorResponse, 404: errorResponse } } },
    '/author/tickets/{id}/attachments': {
      post: {
        summary: 'Upload up to 5 PDF, image, or video files (25 MB each) to an owned ticket',
        security: session,
        parameters: [idParameter],
        requestBody: multipartUploadRequestBody,
        responses: { 201: { description: 'Ticket attachments uploaded' }, 400: errorResponse, 403: errorResponse },
      },
    },
    '/ticket-attachments/{id}': { get: { summary: 'Download an attachment after ticket ownership or admin authorization', security: session, parameters: [idParameter], responses: { 200: { description: 'Attachment file' }, 403: errorResponse, 404: errorResponse } } },
    '/author/tickets/{id}/messages': { post: { summary: 'Reply to an own ticket; a reply reopens Resolved tickets as In Progress', security: session, parameters: [idParameter], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['body'], properties: { body: { type: 'string', minLength: 1, maxLength: 8000 } } } } } }, responses: { 201: { description: 'Reply created' }, 400: errorResponse, 403: errorResponse } } },
    '/author/tickets/{id}/events': { get: { summary: 'Cookie-authenticated Server-Sent Events for new replies and status changes (fetch streaming)', security: session, parameters: [idParameter], responses: { 200: { description: 'text/event-stream' }, 403: errorResponse } } },
    '/admin/dashboard': { get: { summary: 'Ticket queue metrics', security: session, responses: { 200: { description: 'Queue metrics' }, 403: errorResponse } } },
    '/admin/tickets': {
      get: {
        summary: 'Filterable, searchable and paginated ticket queue',
        security: session,
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: statuses } },
          { name: 'category', in: 'query', schema: { type: 'string', enum: categories } },
          { name: 'priority', in: 'query', schema: { type: 'string', enum: priorities } },
          { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'search', in: 'query', schema: { type: 'string', maxLength: 120 } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['updated_desc', 'updated_asc', 'created_desc', 'created_asc', 'oldest_unresolved', 'priority_first'] } },
        ],
        responses: { 200: { description: 'Ticket rows and pagination metadata' }, 403: errorResponse },
      },
    },
    '/admin/tickets/{id}': {
      get: { summary: 'Full ticket detail including internal notes, AI metadata and audit events', security: session, parameters: [idParameter], responses: { 200: { description: 'Ticket detail' }, 404: errorResponse } },
      patch: {
        summary: 'Override triage, move status through the allowed lifecycle, assign to self, or save/delete a draft without sending',
        security: session,
        parameters: [idParameter],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', properties: {
            status: { type: 'string', enum: statuses }, category: { type: 'string', enum: categories },
            priority: { type: 'string', enum: priorities }, assignToMe: { type: 'boolean' },
            aiDraft: { type: 'string', nullable: true, maxLength: 8000 },
          },
        } } } },
        responses: { 200: { description: 'Ticket updated' }, 400: errorResponse, 404: errorResponse },
      },
    },
    '/admin/tickets/{id}/attachments': {
      post: {
        summary: 'Upload up to 5 PDF, image, or video files (25 MB each) to a ticket',
        security: session,
        parameters: [idParameter],
        requestBody: multipartUploadRequestBody,
        responses: { 201: { description: 'Ticket attachments uploaded' }, 400: errorResponse, 404: errorResponse },
      },
    },
    '/admin/tickets/{id}/notes': { post: { summary: 'Add admin-only internal note', security: session, parameters: [idParameter], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['body'], properties: { body: { type: 'string', minLength: 1, maxLength: 8000 } } } } } }, responses: { 201: { description: 'Note created' }, 404: errorResponse } } },
    '/admin/tickets/{id}/ai-draft': { post: { summary: 'Generate/regenerate a cached, KB-grounded reply draft (never sends it)', security: session, parameters: [idParameter], responses: { 200: { description: 'Draft generated and saved' }, 429: errorResponse, 502: errorResponse, 503: errorResponse } } },
    '/admin/tickets/{id}/messages': { post: { summary: 'Send a public reply after explicit admin action; notifies author over SSE and clears the stored draft', security: session, parameters: [idParameter], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['body'], properties: { body: { type: 'string', minLength: 1, maxLength: 8000 } } } } } }, responses: { 201: { description: 'Reply sent' }, 404: errorResponse } } },
  },
};
