# Implementation Approach

## Architecture

The application is split into a React/Vite client and a versioned Express API. The API owns authentication, validation, role checks, data access, ticket lifecycle enforcement, event history, and AI calls. Repository functions isolate MySQL queries; services implement business rules; controllers expose the versioned routes. The frontend uses one cookie-aware API client and role-protected route trees for author and admin workflows.

## Data integrity

The schema separates users/authors, books/platforms, tickets, public responses, internal notes, cached drafts, and ticket audit events. A book is always selected through an ownership check. Ticket lists and detail views are shaped independently so author responses cannot include admin-only notes or rationales. Pending royalties are calculated as earned less paid rather than duplicated as stored state. Before seed writes, sample totals and royalty calculations are validated. The seed operation is designed to be repeatable; it must still be run only against a verified/backup-protected `DB_NAME`.

## Support workflow

Tickets are persisted before asynchronous AI classification begins. AI failure does not prevent submission; administrators receive an explicit failed/skipped state and can classify and reply manually. Category-specific Zod schemas validate AI output, invalid JSON gets one corrective retry, and prompt/policy revisions are versioned. Categories and priorities use the assignment's fixed enums; ISBN/metadata requests are never scored below High, including manual categorization. Admins can override triage, follow the constrained status transitions, assign tickets, add private notes, and edit saved drafts. A draft is never sent automatically. Public replies require an explicit send action and authors receive reply/status events over cookie-authenticated SSE.

## Security and privacy

Sessions use an HttpOnly, SameSite cookie; JWTs are not exposed to frontend JavaScript or URL query strings. CORS is restricted to configured origins, cookie-authenticated mutations require an allowed Origin, and login/AI routes are rate-limited. Inputs and generated AI output are validated; AI ticket text is treated as untrusted and only category-relevant policy sections are sent for drafting. Provider errors and logs avoid storing ticket content, and API error responses do not reveal production stack traces.

Ticket attachments accept PDF, JPG, PNG, GIF, WEBP, MP4, MOV, and WEBM files, up to five per upload and 25 MB each. The backend checks file signatures, stores opaque filenames outside the public web root in `backend/private-uploads/`, and requires authenticated ticket ownership or admin role to download. Attachment metadata is stored in MySQL; the private files themselves must be retained/backed up separately. Production deployments should replace local disk storage with persistent private object storage where appropriate.

## Verification and operational limits

Unit tests cover status transitions, fixed enums, AI JSON schemas, priority floors, seed arithmetic, and author/admin data shaping. Integration tests use a generated test database name, verify real file uploads/downloads and ticket ownership controls, and require MySQL database-creation privileges. The local demo database is seeded with 10 authors and 18 books. AI uses Google's Gemini API and remains inactive until an operator configures `GEMINI_API_KEY` privately. Google AI Studio free-tier availability is subject to model and quota limits, and free-tier data terms may permit submitted content to improve Google products; do not send confidential or sensitive ticket content through a free-tier key without appropriate approval. Production deployment still requires HTTPS, a long random JWT secret, rotated non-default credentials, exact client-origin configuration, persistent private file storage, and secure handling/rotation of any credentials previously committed.
