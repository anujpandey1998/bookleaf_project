# API Reference

The versioned API base is `/api/v1`. Interactive OpenAPI documentation is served at `/api/docs`, the OpenAPI JSON at `/api/openapi.json`, and a health check at `/api/v1/health`. Optional server-side AI triage and reply drafting use Google Gemini; configure `GEMINI_API_KEY` in the backend environment. Free-tier model availability and quota limits can change. Check Google's free-tier data terms before sending real or confidential author information; prefer demo data with a free-tier key.

## Authentication and responses

`POST /auth/login` accepts `{ "email": "...", "password": "..." }`. On success, the API sets the `bookleaf_session` JWT as an HttpOnly cookie and returns `{ "success": true, "data": { "user": { ... } } }`. `POST /auth/signup` accepts `{ "name": "...", "email": "...", "password": "..." }` (password 10–200 characters), creates an author account and linked author profile, and signs the new user in with the same cookie. Email addresses must be unique; signup cannot create administrators. The JWT is not returned in JSON. `POST /auth/logout` clears the cookie; `GET /auth/me` returns the current safe user. Browser clients must include credentials. Same-site cookie and allowed origins are configured by the backend.

Authenticated routes use `AUTHOR` or `ADMIN` roles. API errors have this shape:

```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "A human-readable explanation",
    "details": []
  }
}
```

`details` is omitted when there are no validation details. Authentication, login, and AI-draft routes are rate-limited as applicable.

## Author routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/author/dashboard` | Book, royalty, and ticket metrics |
| GET | `/author/books` | The signed-in author's books and royalty summary |
| GET | `/author/tickets` | The author's tickets |
| POST | `/author/tickets` | Create a ticket; AI triage happens asynchronously |
| GET | `/author/tickets/{id}` | Ticket and public conversation; never internal notes |
| POST | `/author/tickets/{id}/attachments` | Upload files to an owned ticket |
| POST | `/author/tickets/{id}/messages` | Add a public author reply |
| GET | `/author/tickets/{id}/events` | Cookie-authenticated SSE updates |
| GET | `/ticket-attachments/{id}` | Download a file if the current user owns its ticket or is an admin |

Ticket creation accepts `subject` (3–200 characters), `description` (10–8,000 characters), and optional `bookId`. Omit/null `bookId` for general/account-level requests. Upload files as multipart form data under the `files` field. PDF, JPG, PNG, GIF, WEBP, MP4, MOV, and WEBM are accepted, up to five files of 25 MB each. Uploads are signature-checked and stored privately; download access is authenticated and ownership-checked. Authors can reply to their own non-closed tickets; a reply to a Resolved ticket returns it to In Progress.

## Admin routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/dashboard` | Queue totals and unresolved urgency counts |
| GET | `/admin/tickets` | Filter, search, sort, and paginate all tickets |
| GET | `/admin/tickets/{id}` | Full detail, audit history, and internal notes |
| POST | `/admin/tickets/{id}/attachments` | Upload files to a ticket |
| PATCH | `/admin/tickets/{id}` | Change triage/status, assign to self, or save/delete an unsent draft |
| POST | `/admin/tickets/{id}/notes` | Add a private internal note |
| POST | `/admin/tickets/{id}/ai-draft` | Generate/regenerate a cached draft; never sends |
| POST | `/admin/tickets/{id}/messages` | Explicitly send a public reply |

Queue filters are `status`, `category`, `priority`, `dateFrom`, `dateTo`, `search`, `sort`, `page`, and `limit`. The response includes pagination `meta`. Ticket statuses are `Open`, `In Progress`, `Resolved`, and `Closed`: the supported transitions are Open → In Progress → Resolved → Closed, with Resolved → In Progress allowed for reopening. Closed is terminal.

Uploads are saved in the backend's private `private-uploads/` directory, not served as public static files. Keep that directory persistent and backed up with the database in production.

Category and priority values are fixed by the assignment:

- Categories: Royalty & Payments; ISBN & Metadata Issues; Printing & Quality; Distribution & Availability; Book Status & Production Updates; General Inquiry.
- Priorities: Critical; High; Medium; Low. ISBN and metadata tickets have a minimum priority of High.
- Admin overrides cannot lower ISBN and metadata tickets below High.

## Live updates and drafts

The author ticket stream sends `message` and `status` SSE events. It uses fetch streaming so the browser sends the HttpOnly cookie; tokens are never placed in URLs. AI reply drafts are cached for admins, editable, and unsent until an admin explicitly submits a public message. Sending a reply clears the stored draft.
