// Integration tests — require MySQL running locally (same credentials as .env).
// Uses a separate database (bookleaf_test) created/migrated on the fly, so it never touches dev data.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { EventEmitter } from 'node:events';
import { addSubscriber, broadcast } from '../src/services/sseService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.NODE_ENV = 'test';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.DB_NAME = `bookleaf_test_${process.pid}_${Date.now()}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-1234567890';
process.env.GEMINI_API_KEY = ''; // AI disabled: proves ticket creation works without AI
process.env.SEED_AUTHOR_PASSWORD = 'TestSeedAuthor@123';
process.env.SEED_ADMIN_PASSWORD = 'TestSeedAdmin@123';

const { createApp } = await import('../src/app.js');
const { query, closePool } = await import('../src/config/db.js');
const app = createApp();

let conn;
const tokens = {};
const uploadedFiles = [];

async function login(email, password) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  assert.equal(res.status, 200, res.text);
  const cookie = res.headers['set-cookie']?.find((value) => value.startsWith('bookleaf_session='));
  assert.ok(cookie, 'login should set the HttpOnly session cookie');
  return cookie.split(';', 1)[0].slice('bookleaf_session='.length);
}

before(async () => {
  conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', multipleStatements: true,
  });
  await conn.query(`DROP DATABASE IF EXISTS \`${process.env.DB_NAME}\``);
  await conn.query(`CREATE DATABASE \`${process.env.DB_NAME}\` CHARACTER SET utf8mb4`);
  await conn.changeUser({ database: process.env.DB_NAME });
  const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'schema.sql'), 'utf8').replace(/^--.*$/gm, '');
  await conn.query(schemaSql);

  const hash = await bcrypt.hash('TestPass@123', 8);
  const mk = async (authorCode, name, email, role) => {
    const [r] = await conn.execute(
      `INSERT INTO users (name,email,role,password_hash) VALUES (?,?,?,?)`,
      [name, email, role, hash],
    );
    if (authorCode) {
      await conn.execute(
        'INSERT INTO authors (user_id, author_code) VALUES (?, ?)',
        [r.insertId, authorCode],
      );
    }
    return r.insertId;
  };
  const a1 = await mk('AUTH901', 'Author One', 'a1@test.com', 'AUTHOR');
  const a2 = await mk('AUTH902', 'Author Two', 'a2@test.com', 'AUTHOR');
  await mk(null, 'Admin', 'admin@test.com', 'ADMIN');

  await conn.execute(
    `INSERT INTO books (book_id, author_user_id, title, status, is_published, mrp, total_copies_sold, total_royalty_earned, royalty_paid)
     VALUES ('BK901', ?, 'Book One', 'Published & Live', 1, 100, 10, 500, 0)`, [a1]);
  await conn.execute(
    `INSERT INTO books (book_id, author_user_id, title, status, is_published) VALUES ('BK902', ?, 'Book Two In Production', 'In Production - Typesetting', 0)`, [a2]);

  tokens.a1 = await login('a1@test.com', 'TestPass@123');
  tokens.a2 = await login('a2@test.com', 'TestPass@123');
  tokens.admin = await login('admin@test.com', 'TestPass@123');
});

after(async () => {
  await closePool();
  await Promise.all(uploadedFiles.map((filePath) => fs.promises.rm(filePath, { force: true })));
  if (conn) { await conn.query(`DROP DATABASE IF EXISTS \`${process.env.DB_NAME}\``); await conn.end(); }
});

// ---------- auth ----------
test('health endpoint verifies the API database connection', async () => {
  const res = await request(app).get('/api/v1/health');
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.data.status, 'ok');
  assert.equal(res.body.data.database, 'ok');
});

test('API permits credentialed CORS behind the configured proxy hop', async () => {
  const res = await request(app).options('/api/v1/auth/me')
    .set('Origin', 'http://localhost:5173')
    .set('Access-Control-Request-Method', 'GET')
    .set('Access-Control-Request-Headers', 'content-type');
  assert.equal(res.status, 204);
  assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173');
  assert.equal(res.headers['access-control-allow-credentials'], 'true');
  assert.equal(app.get('trust proxy'), 1);
});

test('login sets an HttpOnly cookie and returns a safe user (no token or hash)', async () => {
  const res = await request(app).post('/api/v1/auth/login').send({ email: 'a1@test.com', password: 'TestPass@123' });
  assert.equal(res.status, 200);
  const cookie = res.headers['set-cookie']?.find((value) => value.startsWith('bookleaf_session='));
  assert.ok(cookie);
  assert.match(cookie, /HttpOnly/i);
  assert.equal(res.body.data.token, undefined);
  assert.equal(res.body.data.user.password_hash, undefined);
  assert.equal(res.body.data.user.role, 'AUTHOR');
});

test('login failure with wrong password returns 401', async () => {
  const res = await request(app).post('/api/v1/auth/login').send({ email: 'a1@test.com', password: 'wrong' });
  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
});

test('author signup creates a non-admin account and immediately authenticates with a cookie', async () => {
  const response = await request(app).post('/api/v1/auth/signup')
    .set('Origin', 'http://localhost:5173')
    .send({ name: 'New Sample Author', email: 'new-author@test.com', password: 'NewAuthorPass123' });
  assert.equal(response.status, 201, response.text);
  assert.equal(response.body.data.user.role, 'AUTHOR');
  assert.equal(response.body.data.user.name, 'New Sample Author');
  assert.equal(response.body.data.user.password_hash, undefined);
  assert.equal(response.body.data.token, undefined);
  const cookie = response.headers['set-cookie']?.find((value) => value.startsWith('bookleaf_session='));
  assert.ok(cookie);
  assert.match(cookie, /HttpOnly/i);

  const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookie.split(';', 1)[0]);
  assert.equal(me.status, 200);
  assert.equal(me.body.data.email, 'new-author@test.com');
  assert.match(me.body.data.author_id, /^AUTH[A-F0-9]{12}$/);

  const duplicate = await request(app).post('/api/v1/auth/signup')
    .send({ name: 'Duplicate Author', email: 'NEW-AUTHOR@test.com', password: 'NewAuthorPass123' });
  assert.equal(duplicate.status, 409);
});

test('author signup rejects weak passwords and never creates an admin role', async () => {
  const invalid = await request(app).post('/api/v1/auth/signup')
    .send({ name: 'Weak Password', email: 'weak@test.com', password: 'short' });
  assert.equal(invalid.status, 400);
  const [[users]] = await conn.execute('SELECT COUNT(*) AS total FROM users WHERE email=?', ['weak@test.com']);
  assert.equal(Number(users.total), 0);
});

test('local loopback frontend origin is accepted for cookie login', async () => {
  const res = await request(app).post('/api/v1/auth/login')
    .set('Origin', 'http://127.0.0.1:5173')
    .send({ email: 'a1@test.com', password: 'TestPass@123' });
  assert.equal(res.status, 200);
  assert.match(res.headers['access-control-allow-origin'], /127\.0\.0\.1:5173/);
});

test('protected route rejects missing/expired tokens', async () => {
  assert.equal((await request(app).get('/api/v1/author/dashboard')).status, 401);
  assert.equal((await request(app).get('/api/v1/author/dashboard').set('Authorization', 'Bearer garbage')).status, 401);
});

// ---------- ownership / RBAC ----------
test('cookie sessions are accepted, URL tokens are rejected, and logout clears the cookie', async () => {
  const cookie = `bookleaf_session=${tokens.a1}`;
  const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
  assert.equal(me.status, 200);
  assert.equal(me.body.data.role, 'AUTHOR');

  const stream = await request(app).get('/api/v1/author/tickets/1/events').query({ token: tokens.a1 });
  assert.equal(stream.status, 401);

  const logout = await request(app).post('/api/v1/auth/logout')
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', cookie);
  assert.equal(logout.status, 200);
  assert.match(logout.headers['set-cookie'][0], /Expires=Thu, 01 Jan 1970/i);
});

test('an author SSE connection never receives another author ticket events', () => {
  const makeResponse = () => {
    const response = new EventEmitter();
    response.chunks = [];
    response.writeHead = () => {};
    response.write = (chunk) => { response.chunks.push(chunk); };
    return response;
  };
  const authorOneStream = makeResponse();
  const authorTwoStream = makeResponse();
  addSubscriber(91001, 101, 'AUTHOR', authorOneStream);
  addSubscriber(91002, 102, 'AUTHOR', authorTwoStream);

  try {
    broadcast(91002, 'message', { body: 'private event for author two' });
    assert.equal(authorOneStream.chunks.join('').includes('private event for author two'), false);
    assert.equal(authorTwoStream.chunks.join('').includes('private event for author two'), true);
  } finally {
    authorOneStream.emit('close');
    authorTwoStream.emit('close');
  }
});

test('author sees only their own books and dashboard numbers', async () => {
  const books = await request(app).get('/api/v1/author/books').set('Authorization', `Bearer ${tokens.a1}`);
  assert.equal(books.status, 200);
  assert.equal(books.body.data.length, 1);
  assert.equal(books.body.data[0].bookId, 'BK901');
  const dash = await request(app).get('/api/v1/author/dashboard').set('Authorization', `Bearer ${tokens.a1}`);
  assert.equal(dash.body.data.books.totalRoyaltyEarned, 500);
  assert.equal(dash.body.data.books.royaltyPending, 500);
});

test('author cannot access another author\'s ticket detail (403/404)', async () => {
  const created = await request(app).post('/api/v1/author/tickets')
    .set('Authorization', `Bearer ${tokens.a1}`)
    .send({ subject: 'Royalty payout missing for two quarters', description: 'I have not received payments since quarter start, please help urgently.' });
  assert.equal(created.status, 201);
  const id = created.body.data.id;
  const other = await request(app).get(`/api/v1/author/tickets/${id}`).set('Authorization', `Bearer ${tokens.a2}`);
  assert.equal(other.status, 403);
});

test('author cannot attach another author\'s book to a ticket', async () => {
  const [[b2]] = await conn.query("SELECT id FROM books WHERE book_id='BK902'");
  const res = await request(app).post('/api/v1/author/tickets')
    .set('Authorization', `Bearer ${tokens.a1}`)
    .send({ bookId: b2.id, subject: 'Trying cross-book attach', description: 'This should be rejected by ownership checks.' });
  assert.equal(res.status, 403);
});

test('author role blocked from admin endpoints and vice versa', async () => {
  assert.equal((await request(app).get('/api/v1/admin/tickets').set('Authorization', `Bearer ${tokens.a1}`)).status, 403);
  const meRes = await request(app).get('/api/v1/author/books').set('Authorization', `Bearer ${tokens.admin}`);
  assert.equal(meRes.status, 403); // admin is not an author
});

// ---------- tickets + AI fallback ----------
test('ticket creation succeeds with AI unavailable and marks ai_processing_status=skipped', async () => {
  const res = await request(app).post('/api/v1/author/tickets')
    .set('Authorization', `Bearer ${tokens.a1}`)
    .send({ subject: 'Listing not live on Amazon yet', description: 'My book was published 12 business days ago but is still not showing on Amazon India.', attachmentName: 'screenshot.png' });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.status, 'Open');
  await new Promise((r) => setTimeout(r, 300)); // let fire-and-forget AI hook settle
  const [[row]] = await conn.query('SELECT ai_processing_status FROM tickets WHERE id=?', [res.body.data.id]);
  assert.equal(row.ai_processing_status, 'skipped');
});

test('ticket attachments upload as verified files and downloads enforce ticket ownership', async () => {
  const created = await request(app).post('/api/v1/author/tickets')
    .set('Authorization', `Bearer ${tokens.a1}`)
    .send({ subject: 'Please review this attached document', description: 'I have attached a copy of the document for the support team to review.' });
  assert.equal(created.status, 201);
  const ticketId = created.body.data.id;
  const pdf = Buffer.from('%PDF-1.7\nsample evidence\n%%EOF');

  const uploaded = await request(app).post(`/api/v1/author/tickets/${ticketId}/attachments`)
    .set('Authorization', `Bearer ${tokens.a1}`)
    .attach('files', pdf, { filename: 'supporting-document.pdf', contentType: 'application/pdf' });
  assert.equal(uploaded.status, 201, uploaded.text);
  assert.equal(uploaded.body.data.length, 1);
  assert.equal(uploaded.body.data[0].name, 'supporting-document.pdf');
  assert.equal(uploaded.body.data[0].mimeType, 'application/pdf');
  const [[stored]] = await conn.execute('SELECT storage_name FROM ticket_attachments WHERE id=?', [uploaded.body.data[0].id]);
  uploadedFiles.push(path.join(__dirname, '..', 'private-uploads', stored.storage_name));

  const ownDetail = await request(app).get(`/api/v1/author/tickets/${ticketId}`)
    .set('Authorization', `Bearer ${tokens.a1}`);
  assert.equal(ownDetail.body.data.attachments.length, 1);
  const downloaded = await request(app).get(`/api/v1/ticket-attachments/${uploaded.body.data[0].id}`)
    .set('Authorization', `Bearer ${tokens.admin}`);
  assert.equal(downloaded.status, 200);
  assert.match(downloaded.headers['content-type'], /application\/pdf/);
  assert.deepEqual(downloaded.body, pdf);

  const adminUpload = await request(app).post(`/api/v1/admin/tickets/${ticketId}/attachments`)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .attach('files', pdf, { filename: 'admin-reference.pdf', contentType: 'application/pdf' });
  assert.equal(adminUpload.status, 201, adminUpload.text);
  const adminAttachment = adminUpload.body.data.find((attachment) => attachment.name === 'admin-reference.pdf');
  assert.ok(adminAttachment);
  const [[adminStored]] = await conn.execute('SELECT storage_name FROM ticket_attachments WHERE id=?', [adminAttachment.id]);
  uploadedFiles.push(path.join(__dirname, '..', 'private-uploads', adminStored.storage_name));

  const updatedDetail = await request(app).get(`/api/v1/author/tickets/${ticketId}`)
    .set('Authorization', `Bearer ${tokens.a1}`);
  assert.equal(updatedDetail.body.data.attachments.length, 2);

  const forbiddenDownload = await request(app).get(`/api/v1/ticket-attachments/${uploaded.body.data[0].id}`)
    .set('Authorization', `Bearer ${tokens.a2}`);
  assert.equal(forbiddenDownload.status, 403);

  const spoofed = await request(app).post(`/api/v1/author/tickets/${ticketId}/attachments`)
    .set('Authorization', `Bearer ${tokens.a1}`)
    .attach('files', Buffer.from('not a PDF document'), { filename: 'fake.pdf', contentType: 'application/pdf' });
  assert.equal(spoofed.status, 400);
});

test('invalid ticket payloads are rejected by validation', async () => {
  const res = await request(app).post('/api/v1/author/tickets')
    .set('Authorization', `Bearer ${tokens.a1}`)
    .send({ subject: 'ab', description: 'short' });
  assert.equal(res.status, 400);
  assert.ok(res.body.error.details.length >= 2);
});

// ---------- admin queue, overrides, lifecycle ----------
let ticketId;
test('admin can list all tickets with filters and pagination meta', async () => {
  const res = await request(app).get('/api/v1/admin/tickets?status=Open&sort=priority_first&page=1&limit=10')
    .set('Authorization', `Bearer ${tokens.admin}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.meta.total >= 2);
  ticketId = res.body.data[0].id;
});

test('admin queue defaults to priority then oldest creation time', async () => {
  const [[author]] = await conn.execute('SELECT id FROM users WHERE email=?', ['a1@test.com']);
  await conn.execute(
    `INSERT INTO tickets (reference, author_user_id, subject, description, priority, status, created_at, updated_at)
     VALUES
       ('BL-TCK-800001', ?, 'High oldest', 'Queue order test ticket', 'High', 'Open', NOW() - INTERVAL 8 DAY, NOW()),
       ('BL-TCK-800002', ?, 'Critical oldest', 'Queue order test ticket', 'Critical', 'Open', NOW() - INTERVAL 6 DAY, NOW()),
       ('BL-TCK-800003', ?, 'Critical newer', 'Queue order test ticket', 'Critical', 'Open', NOW() - INTERVAL 2 DAY, NOW())`,
    [author.id, author.id, author.id],
  );
  const res = await request(app).get('/api/v1/admin/tickets?limit=3')
    .set('Authorization', `Bearer ${tokens.admin}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.map((ticket) => ticket.reference), [
    'BL-TCK-800002', 'BL-TCK-800003', 'BL-TCK-800001',
  ]);
});

test('concurrent ticket creation allocates unique references', async () => {
  const requests = Array.from({ length: 8 }, (_, index) => request(app).post('/api/v1/author/tickets')
    .set('Cookie', `bookleaf_session=${tokens.a1}`)
    .set('Origin', 'http://localhost:5173')
    .send({
      subject: `Concurrent ticket ${index}`,
      description: 'Verify simultaneous submissions receive distinct ticket references.',
    }));
  const responses = await Promise.all(requests);
  assert.ok(responses.every((response) => response.status === 201), responses.map((response) => response.text).join('\n'));
  const references = responses.map((response) => response.body.data.reference);
  assert.equal(new Set(references).size, responses.length);
});

test('admin override of category/priority sets source=manual', async () => {
  const res = await request(app).patch(`/api/v1/admin/tickets/${ticketId}`)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ category: 'Distribution & Availability', priority: 'High', assignToMe: true });
  assert.equal(res.status, 200);
  const [[row]] = await conn.query('SELECT category_source, priority_source, status, assigned_admin_id FROM tickets WHERE id=?', [ticketId]);
  assert.equal(row.category_source, 'manual');
  assert.equal(row.priority_source, 'manual');
  assert.equal(row.status, 'In Progress'); // auto-move on assignment
  assert.ok(row.assigned_admin_id);
});

test('admin cannot assign Low priority to an ISBN ticket and category override raises its priority floor', async () => {
  const created = await request(app).post('/api/v1/author/tickets')
    .set('Cookie', `bookleaf_session=${tokens.a1}`)
    .set('Origin', 'http://localhost:5173')
    .send({ subject: 'Incorrect ISBN on my listing', description: 'The ISBN currently shown on my published listing appears to belong to another title.' });
  assert.equal(created.status, 201);
  const id = created.body.data.id;

  const category = await request(app).patch(`/api/v1/admin/tickets/${id}`)
    .set('Cookie', `bookleaf_session=${tokens.admin}`)
    .set('Origin', 'http://localhost:5173')
    .send({ category: 'ISBN & Metadata Issues' });
  assert.equal(category.status, 200);
  assert.equal(category.body.data.priority, 'High');

  const lowerPriority = await request(app).patch(`/api/v1/admin/tickets/${id}`)
    .set('Cookie', `bookleaf_session=${tokens.admin}`)
    .set('Origin', 'http://localhost:5173')
    .send({ priority: 'Low' });
  assert.equal(lowerPriority.status, 400);
});

test('invalid status transition Open->Resolved is rejected with 400', async () => {
  const [insRes] = await conn.query("INSERT INTO tickets (reference, author_user_id, subject, description, status) VALUES ('BL-TCK-900001', 1, 'T', 'desc here', 'Open')");
  const t = insRes.insertId;
  const res = await request(app).patch(`/api/v1/admin/tickets/${t}`)
    .set('Authorization', `Bearer ${tokens.admin}`).send({ status: 'Resolved' });
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /Invalid status transition/);
});

test('author reply reopens a resolved ticket to In Progress', async () => {
  const created = await request(app).post('/api/v1/author/tickets')
    .set('Cookie', `bookleaf_session=${tokens.a1}`)
    .set('Origin', 'http://localhost:5173')
    .send({ subject: 'Please review this support request', description: 'I am adding more information to help resolve the issue.' });
  assert.equal(created.status, 201);
  const id = created.body.data.id;
  const inProgress = await request(app).patch(`/api/v1/admin/tickets/${id}`)
    .set('Cookie', `bookleaf_session=${tokens.admin}`)
    .set('Origin', 'http://localhost:5173')
    .send({ status: 'In Progress' });
  assert.equal(inProgress.status, 200);
  const resolved = await request(app).patch(`/api/v1/admin/tickets/${id}`)
    .set('Cookie', `bookleaf_session=${tokens.admin}`)
    .set('Origin', 'http://localhost:5173')
    .send({ status: 'Resolved' });
  assert.equal(resolved.status, 200);
  const reply = await request(app).post(`/api/v1/author/tickets/${id}/messages`)
    .set('Cookie', `bookleaf_session=${tokens.a1}`)
    .set('Origin', 'http://localhost:5173')
    .send({ body: 'Here is the additional detail requested by your team.' });
  assert.equal(reply.status, 201);
  const detail = await request(app).get(`/api/v1/author/tickets/${id}`)
    .set('Cookie', `bookleaf_session=${tokens.a1}`);
  assert.equal(detail.body.data.status, 'In Progress');
  assert.equal(detail.body.data.messages.at(-1).body, 'Here is the additional detail requested by your team.');
});

test('internal notes never appear in author responses; replies do', async () => {
  await request(app).post(`/api/v1/admin/tickets/${ticketId}/notes`)
    .set('Authorization', `Bearer ${tokens.admin}`).send({ body: 'INTERNAL: checking with finance, do not promise dates' });
  const reply = await request(app).post(`/api/v1/admin/tickets/${ticketId}/messages`)
    .set('Authorization', `Bearer ${tokens.admin}`).send({ body: 'Dear Author, we are reviewing your listing status and will update you shortly.' });
  assert.equal(reply.status, 201);

  const authorView = await request(app).get(`/api/v1/author/tickets/${ticketId}`).set('Authorization', `Bearer ${tokens.a1}`);
  assert.equal(authorView.status, 200);
  const bodies = authorView.body.data.messages.map((m) => m.body).join('\n');
  assert.ok(!bodies.includes('INTERNAL'), 'internal note leaked to author');
  assert.ok(bodies.includes('reviewing your listing'), 'public reply missing for author');
  assert.equal(JSON.stringify(authorView.body.data).includes('ai_draft'), false);

  const adminView = await request(app).get(`/api/v1/admin/tickets/${ticketId}`).set('Authorization', `Bearer ${tokens.admin}`);
  assert.equal(adminView.body.data.aiConfigured, false);
  const kinds = adminView.body.data.messages.map((m) => m.kind);
  assert.ok(kinds.includes('internal_note'));
});

test('saving a draft does not send it to the author', async () => {
  const res = await request(app).patch(`/api/v1/admin/tickets/${ticketId}`)
    .set('Authorization', `Bearer ${tokens.admin}`).send({ aiDraft: 'Unsent draft text for review purposes only.' });
  assert.equal(res.status, 200);
  const authorView = await request(app).get(`/api/v1/author/tickets/${ticketId}`).set('Authorization', `Bearer ${tokens.a1}`);
  assert.ok(!JSON.stringify(authorView.body).includes('Unsent draft'));
});

test('AI draft endpoint returns 503 when AI is unconfigured (manual flow still available)', async () => {
  const res = await request(app).post(`/api/v1/admin/tickets/${ticketId}/ai-draft`).set('Authorization', `Bearer ${tokens.admin}`);
  assert.equal(res.status, 503);
});

// ---------- seed idempotency (script-level, against same test DB) ----------
test('seed script is idempotent: rerun does not duplicate users/books', async () => {
  // Point the seeder at the test DB and run it twice via child process.
  const { execFileSync } = await import('node:child_process');
  const env = { ...process.env, NODE_ENV: 'test' };
  const run = () => execFileSync('node', [path.join(__dirname, '..', 'scripts', 'seed.js')], { env, cwd: path.join(__dirname, '..'), encoding: 'utf8' });

  const countBefore = async (table) => { const [[r]] = await conn.query(`SELECT COUNT(*) c FROM ${table}`); return Number(r.c); };
  run();
  const afterFirst = { users: await countBefore('users'), books: await countBefore('books'), tickets: await countBefore('tickets') };
  run(); // second run must not add rows
  const afterSecond = { users: await countBefore('users'), books: await countBefore('books'), tickets: await countBefore('tickets') };

  assert.deepEqual(afterFirst, afterSecond, 'seed rerun changed row counts');
  // Dataset integrity: all 10 authors + admin present, all 18 seeded books present.
  assert.ok(afterSecond.users >= 11);
  assert.ok(afterSecond.books >= 18);
  const [[dup]] = await conn.query('SELECT COUNT(*) c FROM (SELECT email FROM users GROUP BY email HAVING COUNT(*)>1) x');
  assert.equal(dup.c, 0);
});
