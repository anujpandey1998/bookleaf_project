# Production deployment

This is a deployment checklist, not a record of a deployed service. No cloud deployment has been run or verified.

## Service layout

### MySQL: Railway or Aiven

Create a MySQL 8 database. Copy its connection values to the backend variables `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`. Use TLS if the provider requires it; the current backend does not expose a separate database TLS configuration, so verify the provider connection requirements before choosing it.

### API: Render Web Service

Create a Node Web Service with:

- Root directory: `backend`
- Build command: `npm ci`
- Start command: `npm start`
- Health check path: `/api/v1/health`

Render supplies `PORT`. The server listens on that port, trusts one reverse-proxy hop (`app.set('trust proxy', 1)`), and uses Express CORS credentials. The health endpoint performs `SELECT 1` against MySQL and returns 503 if the database is unavailable.

Set these environment variable names on the API service:

```text
NODE_ENV
PORT
CLIENT_ORIGIN
DB_HOST
DB_PORT
DB_USER
DB_PASSWORD
DB_NAME
JWT_SECRET
JWT_EXPIRES_IN
BCRYPT_ROUNDS
AUTH_COOKIE_SAME_SITE
COOKIE_SECURE
GEMINI_API_KEY
GEMINI_MODEL
AI_MAX_TOKENS
AI_TIMEOUT_MS
AI_MAX_RETRIES
```

`JWT_SECRET` must contain at least 32 characters. `CLIENT_ORIGIN` is the exact public frontend origin, including `https://` and no path. Multiple exact origins may be comma-separated. Configure `AUTH_COOKIE_SAME_SITE=None` and `COOKIE_SECURE=true` for a cross-site HTTPS frontend/backend pairing. `PORT` is provided by Render; do not hard-code it.

For a one-time seed only, temporarily provide these additional API environment variables, matching the demo credentials you set in the README:

```text
SEED_AUTHOR_PASSWORD
SEED_ADMIN_PASSWORD
```

Do not print credentials in build logs or put them in repository files.

### Frontend: Render Static Site or Vercel

Use the frontend directory as the project root:

- Root directory: `frontend`
- Build command: `npm run build`
- Output/publish directory: `dist`
- Build-time environment variable: `VITE_API_BASE`

Set `VITE_API_BASE` to the API origin only, for example `https://<api-host>`; the client adds `/api/v1`. Configure SPA fallback/rewrite so every unknown client-side route serves `/index.html` (Render rewrite: source `/*`, destination `/index.html`, action `Rewrite`; Vercel rewrite: source `/(.*)`, destination `/index.html`).

After the frontend URL is final, set the API's `CLIENT_ORIGIN` to that exact origin and redeploy the API. If using preview deployments, add only the specific origins that should be allowed.

## Cross-origin cookie/session checks

The browser client sends API calls with `credentials: 'include'`. The ticket SSE stream also uses `fetch` with `credentials: 'include'` (not browser `EventSource`), so its HttpOnly cookie is sent cross-origin when the cookie and CORS policies allow it. The API responds with CORS credentials enabled and an exact origin allow-list; wildcard origins are not used. Cookie-authenticated mutations are also checked against the allowed `Origin`.

Express trusts one proxy hop so HTTPS termination at Render/Railway is recognized. For `SameSite=None`, the API requires a secure cookie; production defaults `COOKIE_SECURE` on, but set both explicitly as listed above. The production browser must access both services over HTTPS.

Important browser limitation: separate default provider domains such as `*.vercel.app` and `*.onrender.com` are cross-site. Some browsers or privacy settings block third-party cookies even with `SameSite=None`. For reliable sessions, use custom frontend/API hostnames under the same registrable domain (for example `app.example.com` and `api.example.com`), keep HTTPS, set the exact `CLIENT_ORIGIN`, and retest login, refresh, logout, attachment download, and SSE in the target browsers. Do not claim cross-site sessions work until tested in the actual deployed domains.

## Safe production seed

Seeding writes demo authors, books, platforms, and administrator accounts. Run it only once when preparing a new database:

1. Confirm the production backend `DB_HOST`, `DB_NAME`, and database provider in the dashboard. Verify `DB_NAME` carefully; do not assume it points to an empty database.
2. Take a database backup and confirm the target database is new or intentionally prepared for this seed.
3. Set `SEED_AUTHOR_PASSWORD` and `SEED_ADMIN_PASSWORD` in the backend environment to the exact demo passwords you publish in the README. Never put real passwords in this document or Git history.
4. From a trusted local terminal, use the production connection settings without printing them and run `npm run seed` from `backend/`.
5. Check the seed command's success output and verify the expected demo records in the intended database. Remove the seed passwords from the environment when seeding is complete, then test a demo login over HTTPS.

The seed is designed to be idempotent, but this is not a substitute for checking the target and backing it up. Do not run seed automatically on every service start.

## Persistent attachment storage

The application writes files to `backend/private-uploads/`. Render's free web services have ephemeral filesystems: uploads may disappear after a restart or redeploy. Attachments are a bonus feature; do not treat free-tier local disk as durable storage. The current production application has no object-storage adapter. If durable uploads are required, deploy on a persistent disk plan or add and test private object storage with lifecycle, backup, and access controls before relying on attachments.

## Variables by service

Values are intentionally omitted; set them in each provider's private environment-variable dashboard.

- API runtime: names in the API checklist above.
- API one-time seed: `SEED_AUTHOR_PASSWORD`, `SEED_ADMIN_PASSWORD`.
- Frontend build: `VITE_API_BASE`.
- MySQL provider: provider supplies connection values mapped into the API's `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.
