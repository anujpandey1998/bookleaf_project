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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'bookleaf_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-1234567890';
process.env.ANTHROPIC_API_KEY = ''; // AI disabled: proves ticket creation works without AI

const { createApp } = await import('../src/app.js');
const { query, closePool } = await import('../src/config/db.js');
const app = createApp();

let conn;
const tokens = {};

async function login(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200, res.text);
  return res.body.data.token;
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
  const mk = async (authorId, name, email, role) => {
    const [r] = await conn.execute(
      `INSERT INTO users (author_id,name,email,role,password_hash) VALUES (?,?,?,?,?)`,
      [authorId, name, email, role, hash],
    );
    return r.insertId;
  };
  const a1 = await mk('AUTH901', 'Author One', 'a1@test.com', 'author');
  const a2 = await mk('AUTH902', 'Author Two', 'a2@test.com', 'author');
  await mk(null, 'Admin', 'admin@test.com', 'admin');

  await conn.execute(
    `INSERT INTO books (book_id, author_user_id, title, status, is_published, mrp, total_copies_sold, total_royalty_earned, royalty_paid, royalty_pending)
     VALUES ('BK901', ?, 'Book One', 'Published & Live', 1, 100, 10, 500, 0, 500)`, [a1]);
  await conn.execute(
    `INSERT INTO books (book_id, author_user_id, title, status, is_published) VALUES ('BK902', ?, 'Book Two In Production', 'In Production - Typesetting', 0)`, [a2]);

  tokens.a1 = await login('a1@test.com', 'TestPass@123');
  tokens.a2 = await login('a2@test.com', 'TestPass@123');
  tokens.admin = await login('admin@test.com', 'TestPass@123');
});

after(async () => {
  await closePool();
  if (conn) { await conn.query(`DROP DATABASE IF EXISTS \`${process.env.DB_NAME}\``); await conn.end(); }
});

// ---------- auth ----------
test('login success returns token and safe user (no hash)', async () => {
  const res = await request(app).post('/api/auth/login').send({ email: 'a1@test.com', password: 'TestPass@123' });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.token);
  assert.equal(res.body.data.user.password_hash, undefined);
  assert.equal(res.body.data.user.role, 'author');
});

test('login failure with wrong password returns 401', async () => {
  const res = await request(app).post('/api/auth/login').send({ email: 'a1@test.com', password: 'wrong' });
  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
});

test('protected route rejects missing/expired tokens', async () => {
  assert.equal((await request(app).get('/api/author/dashboard')).status, 401);
  assert.equal((await request(app).get('/api/author/dashboard').set('Authorization', 'Bearer garbage')).status, 401);
});

// ---------- ownership / RBAC ----------
test('author sees only their own books and dashboard numbers', async () => {
  const books = await request(app).get('/api/author/books').set('Authorization', `Bearer ${tokens.a1}`);
  assert.equal(books.status, 200);
  assert.equal(books.body.data.length, 1);
  assert.equal(books.body.data[0].bookId, 'BK901');
  const dash = await request(app).get('/api/author/dashboard').set('Authorization', `Bearer ${tokens.a1}`);
  assert.equal(dash.body.data.books.totalRoyaltyEarned, 500);
  assert.equal(dash.body.data.books.royaltyPending, 500);
});

test('author cannot access another author\'s ticket detail (403/404)', async () => {
  const created = await request(app).post('/api/author/tickets')
    .set('Authorization', `Bearer ${tokens.a1}`)
    .send({ subject: 'Royalty payout missing for two quarters', description: 'I have not received payments since quarter start, please help urgently.' });
  assert.equal(created.status, 201);
  const id = created.body.data.id;
  const other = await request(app).get(`/api/author/tickets/${id}`).set('Authorization', `Bearer ${tokens.a2}`);
  assert.equal(other.status, 403);
});

test('author cannot attach another author\'s book to a ticket', async () => {
  const [[b2]] = await conn.query("SELECT id FROM books WHERE book_id='BK902'");
  const res = await request(app).post('/api/author/tickets')
    .set('Authorization', `Bearer ${tokens.a1}`)
    .send({ bookId: b2.id, subject: 'Trying cross-book attach', description: 'This should be rejected by ownership checks.' });
  assert.equal(res.status, 403);
});

test('author role blocked from admin endpoints and vice versa', async () => {
  assert.equal((await request(app).get('/api/admin/tickets').set('Authorization', `Bearer ${tokens.a1}`)).status, 403);
  const meRes = await request(app).get('/api/author/books').set('Authorization', `Bearer ${tokens.admin}`);
  assert.equal(meRes.status, 403); // admin is not an author
});

// ---------- tickets + AI fallback ----------
test('ticket creation succeeds with AI unavailable and marks ai_processing_status=skipped', async () => {
  const res = await request(app).post('/api/author/tickets')
    .set('Authorization', `Bearer ${tokens.a1}`)
    .send({ subject: 'Listing not live on Amazon yet', description: 'My book was published 12 business days ago but is still not showing on Amazon India.', attachmentName: 'screenshot.png' });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.status, 'Open');
  await new Promise((r) => setTimeout(r, 300)); // let fire-and-forget AI hook settle
  const [[row]] = await conn.query('SELECT ai_processing_status FROM tickets WHERE id=?', [res.body.data.id]);
  assert.equal(row.ai_processing_status, 'skipped');
});

test('invalid ticket payloads are rejected by validation', async () => {
  const res = await request(app).post('/api/author/tickets')
    .set('Authorization', `Bearer ${tokens.a1}`)
    .send({ subject: 'ab', description: 'short' });
  assert.equal(res.status, 400);
  assert.ok(res.body.error.details.length >= 2);
});

// ---------- admin queue, overrides, lifecycle ----------
let ticketId;
test('admin can list all tickets with filters and pagination meta', async () => {
  const res = await request(app).get('/api/admin/tickets?status=Open&sort=priority_first&page=1&limit=10')
    .set('Authorization', `Bearer ${tokens.admin}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.meta.total >= 2);
  ticketId = res.body.data[0].id;
});

test('admin override of category/priority sets source=manual', async () => {
  const res = await request(app).patch(`/api/admin/tickets/${ticketId}`)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ category: 'Distribution & Availability', priority: 'High', assignToMe: true });
  assert.equal(res.status, 200);
  const [[row]] = await conn.query('SELECT category_source, priority_source, status, assigned_admin_id FROM tickets WHERE id=?', [ticketId]);
  assert.equal(row.category_source, 'manual');
  assert.equal(row.priority_source, 'manual');
  assert.equal(row.status, 'In Progress'); // auto-move on assignment
  assert.ok(row.assigned_admin_id);
});

test('invalid status transition Open->Resolved is rejected with 400', async () => {
  const [insRes] = await conn.query("INSERT INTO tickets (reference, author_user_id, subject, description, status) VALUES ('BL-TCK-900001', 1, 'T', 'desc here', 'Open')");
  const t = insRes.insertId;
  const res = await request(app).patch(`/api/admin/tickets/${t}`)
    .set('Authorization', `Bearer ${tokens.admin}`).send({ status: 'Resolved' });
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /Invalid status transition/);
});

test('internal notes never appear in author responses; replies do', async () => {
  await request(app).post(`/api/admin/tickets/${ticketId}/notes`)
    .set('Authorization', `Bearer ${tokens.admin}`).send({ body: 'INTERNAL: checking with finance, do not promise dates' });
  const reply = await request(app).post(`/api/admin/tickets/${ticketId}/messages`)
    .set('Authorization', `Bearer ${tokens.admin}`).send({ body: 'Dear Author, we are reviewing your listing status and will update you shortly.' });
  assert.equal(reply.status, 201);

  const authorView = await request(app).get(`/api/author/tickets/${ticketId}`).set('Authorization', `Bearer ${tokens.a1}`);
  assert.equal(authorView.status, 200);
  const bodies = authorView.body.data.messages.map((m) => m.body).join('\n');
  assert.ok(!bodies.includes('INTERNAL'), 'internal note leaked to author');
  assert.ok(bodies.includes('reviewing your listing'), 'public reply missing for author');
  assert.equal(JSON.stringify(authorView.body.data).includes('ai_draft'), false);

  const adminView = await request(app).get(`/api/admin/tickets/${ticketId}`).set('Authorization', `Bearer ${tokens.admin}`);
  const kinds = adminView.body.data.messages.map((m) => m.kind);
  assert.ok(kinds.includes('internal_note'));
});

test('saving a draft does not send it to the author', async () => {
  const res = await request(app).patch(`/api/admin/tickets/${ticketId}`)
    .set('Authorization', `Bearer ${tokens.admin}`).send({ aiDraft: 'Unsent draft text for review purposes only.' });
  assert.equal(res.status, 200);
  const authorView = await request(app).get(`/api/author/tickets/${ticketId}`).set('Authorization', `Bearer ${tokens.a1}`);
  assert.ok(!JSON.stringify(authorView.body).includes('Unsent draft'));
});

test('AI draft endpoint returns 503 when AI is unconfigured (manual flow still available)', async () => {
  const res = await request(app).post(`/api/admin/tickets/${ticketId}/ai-draft`).set('Authorization', `Bearer ${tokens.admin}`);
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
