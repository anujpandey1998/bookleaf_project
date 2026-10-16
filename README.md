# BookLeaf Author Support Portal

A role-based publishing support portal for authors and BookLeaf support administrators. Authors can review book and royalty information, open tickets, and follow replies. Administrators can triage a shared queue, assign and update tickets, keep private notes, and prepare reviewed replies.

## Stack

- Frontend: React 18, React Router, Vite
- Backend: Node.js 18+, Express, MySQL 8, Zod
- Authentication: signed JWT in an HttpOnly cookie
- Optional AI: Google Gemini API via Google AI Studio, called only by the backend

## Local setup

1. Install Node.js 18+ and MySQL 8.
2. Run `npm install` from `backend/`, then create a private `backend/.env` based on `.env.example`.
3. Set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, a long random `JWT_SECRET`, and non-default `SEED_AUTHOR_PASSWORD` and `SEED_ADMIN_PASSWORD` values. Keep `.env` private and do not commit it.
4. Start MySQL and run `npm run seed` from `backend/`. The seed script validates the supplied sample-data royalty arithmetic, applies the schema and migrations, and idempotently upserts the provided books, authors, and two admin accounts.
5. Start the API with `npm run dev` from `backend/` (default `http://localhost:4000`).
6. Run `npm install` from `frontend/`, then `npm run dev` (default `http://localhost:5173`).
7. Open `http://localhost:5173/login`. Authors can sign in with a seeded account or create their own author account using the **New author? Create an account** link. Seeded author accounts use the shared `SEED_AUTHOR_PASSWORD`; admin accounts use `SEED_ADMIN_PASSWORD`. For example, `priya.sharma@email.com` is a seeded author login and `admin@bookleafpublishing.com` is an admin login.

The seed command writes to the database named by `DB_NAME`. Verify that name and take a backup before running it against any database containing important data. The integration test creates and drops a uniquely named test database and requires a MySQL account permitted to create/drop databases; it does not use the configured application database.

For AI features, create an API key in [Google AI Studio](https://aistudio.google.com/apikey), then set `GEMINI_API_KEY` in the private `backend/.env` file. The default `GEMINI_MODEL` is `gemini-3.5-flash-lite`; override it only with a model enabled for your account. AI Studio offers free-tier access subject to model availability, region, and quotas, so Google may reject requests when free limits are reached. Never commit or send the key in chat. Google's free-tier data terms may allow submitted content to be used to improve its products; use fictional/demo tickets with a free-tier key and do not submit confidential or sensitive author information unless your organization's terms and consent allow it. Without a key, ticket submission and manual triage/replies continue to work; AI triage is marked as skipped and administrators can respond manually. Configure `CLIENT_ORIGIN` to the exact frontend origin. In production, serve over HTTPS and set a strong `JWT_SECRET`.

Ticket files can be uploaded when creating a ticket or later from its detail page. The supported formats, limits, private storage location, and access rules are described below and in [docs/API.md](./docs/API.md).

## Commands

From `backend/`:

```text
npm run dev
npm start
npm run seed
npm run test:unit
npm test
```

From `frontend/`:

```text
npm run dev
npm run build
npm run preview
```

The frontend build compiles the static SPA into `frontend/dist`. Configure the host to serve `index.html` for client-side routes. Configure `VITE_API_BASE` to the API origin when frontend and API are on different hosts; the client appends `/api/v1`. Production deployment settings, environment variable names, cross-origin cookie requirements, and safe seeding steps are in [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).

### Production deployment checklist

- Backend on Render: root `backend`, build `npm ci`, start `npm start`, health check `/api/v1/health`.
- Frontend on Render Static Site or Vercel: root `frontend`, build `npm run build`, publish `dist`, and rewrite SPA paths to `/index.html`.
- MySQL 8 on Railway or Aiven: map the provider connection values to the API's `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.
- Set the production API's `CLIENT_ORIGIN` to the exact frontend origin. For separate HTTPS origins, set `AUTH_COOKIE_SAME_SITE=None` and `COOKIE_SECURE=true`; use a `JWT_SECRET` of at least 32 characters.
- Seed a new production database only after verifying `DB_NAME` and taking a backup. Set `SEED_AUTHOR_PASSWORD` and `SEED_ADMIN_PASSWORD` to the demo credentials you choose and publish below; remove those seed variables after the one-time seed.
- Do not rely on Render free-tier local disk for durable attachments. `backend/private-uploads/` is ephemeral there; attachments are a bonus feature until persistent/object storage is configured.

See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for the full provider configuration and cross-origin cookie limitations. Deployment has not been performed or verified.

## Engineering notes

### Architecture decisions

The UI is a React/Vite SPA and the backend is a versioned Express API backed by MySQL. Business rules and SQL are separated into services and repositories so ownership checks, ticket state transitions, and validation stay server-side. Sessions use an HttpOnly cookie rather than JavaScript-managed tokens. Ticket drafts and audit events are persisted in MySQL; uploads use private local storage in development.

### AI prompt strategy

Gemini is called only from the backend. Ticket subject and description are explicitly marked as untrusted input. Draft prompts include only the policy sections and one or two query/reply examples for the ticket's category. Classification and priority outputs must match fixed enums; reply drafts are schema-checked and limited to 80–300 words. New tickets are triaged asynchronously, and an uncached reply draft is generated when an administrator first opens a ticket. Drafts are cached, never sent automatically, and require human review and an explicit send action.

### Error handling

Invalid request data is rejected by Zod before business logic runs. API errors use a consistent JSON response and meaningful HTTP status codes. Ticket creation succeeds even if AI triage fails; the failure is recorded for admins, who can continue manually. Draft generation errors are surfaced in the admin UI with a retry option. Provider errors are mapped to safe messages rather than exposing credentials or raw ticket content.

### Cost management

AI is optional and disabled when `GEMINI_API_KEY` is unset. Category-specific policy/example selection avoids sending the entire knowledge base. Cached drafts are reused instead of regenerated on subsequent ticket opens; regeneration is an explicit admin action. `AI_MAX_TOKENS`, `AI_TIMEOUT_MS`, and `AI_MAX_RETRIES` bound generation size, request duration, and retries. Provider quotas and pricing can change, so monitor usage in Google AI Studio; do not use a free-tier key with confidential ticket data unless its terms and your organization's approval permit it.

### Model choice: Gemini

Gemini was chosen because the project uses a Google AI Studio key and can call the provider directly from Node without exposing that key in the browser. `gemini-3.5-flash-lite` is the default lightweight model for this classification and drafting workload. Model access, regional availability, free-tier quota, latency, and pricing depend on the Google account and can change; `GEMINI_MODEL` can be changed to a supported model.

### Known limitations

- This is a demo support portal, not a payment processor; royalty amounts are sample records and payouts are not transferred by the application.
- The seeded accounts and books are fictional demo data. Signup creates an author account but does not verify email ownership.
- AI output can be incorrect despite schema validation. Admin review is required, and the application never sends an AI draft automatically.
- Uploaded files use local private disk storage; production should use persistent private object storage and an operational backup/retention policy.
- SSE updates require an active browser connection. Email notifications and an external production monitoring service are not included.
- The integration suite requires MySQL privileges to create and drop a dedicated test database.

### Demo credentials

| Role | Demo email | Password |
|---|---|---|
| Author | `priya.sharma@email.com` | The value configured as `SEED_AUTHOR_PASSWORD` in your private `backend/.env` |
| Admin | `admin@bookleafpublishing.com` | The value configured as `SEED_ADMIN_PASSWORD` in your private `backend/.env` |
| Admin | `operations@bookleafpublishing.com` | The value configured as `SEED_ADMIN_PASSWORD` in your private `backend/.env` |

The repository intentionally contains no working demo passwords. Set strong local values before seeding; rotate them before any shared or production deployment. Additional authors can register from the login page.

## Access and privacy

The seed process creates 10 demo author accounts from the sample dataset and provisions two administrator accounts (`admin@bookleafpublishing.com` and `operations@bookleafpublishing.com`). Set their shared initial password through `SEED_ADMIN_PASSWORD` and rotate it after deployment. Author initial passwords come from `SEED_AUTHOR_PASSWORD`; distribute credentials securely and rotate them before production use. Seeded author addresses are demo identities, not guaranteed mailboxes.

Session JWTs are not returned to JavaScript or stored in local storage. Ticket attachments support PDF, JPG, PNG, GIF, WEBP, MP4, MOV, and WEBM files (up to five files, 25 MB each). Files are stored outside the public web root in `backend/private-uploads/`; back up this directory alongside the database and use persistent private storage in production. Downloads require an authenticated ticket owner or admin. Internal notes and AI rationale are restricted to the admin API. See [docs/API.md](./docs/API.md) and [docs/APPROACH.md](./docs/APPROACH.md).
