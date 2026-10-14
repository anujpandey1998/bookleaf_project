// Idempotent seed script.
//  - Creates the admin account (never via public signup).
//  - Upserts all 10 authors and 18 books from bookleaf_sample_data.json, preserving figures exactly.
//  - Optionally seeds demo tickets/messages when SEED_DEMO_TICKETS=true.
// Re-running updates existing rows instead of creating duplicates.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { config } from '../src/config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data', 'bookleaf_sample_data.json');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

async function ensureDatabase() {
  const conn = await mysql.createConnection({
    host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password,
    multipleStatements: true,
  });
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await conn.changeUser({ database: config.db.database });
  const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf8').replace(/^--.*$/gm, '');
  await conn.query(schemaSql);
  return conn;
}

async function upsertAuthor(conn, a, passwordHash) {
  const [existing] = await conn.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [a.email.toLowerCase()]);
  if (existing.length) {
    await conn.execute(
      `UPDATE users SET name=?, phone=?, city=?, joined_date=?, role='author', author_id=? WHERE id=?`,
      [a.name, a.phone, a.city, a.joined_date, a.author_id, existing[0].id],
    );
    return existing[0].id;
  }
  const [res] = await conn.execute(
    `INSERT INTO users (author_id, name, email, phone, city, role, password_hash, joined_date)
     VALUES (?, ?, ?, ?, ?, 'author', ?, ?)`,
    [a.author_id, a.name, a.email.toLowerCase(), a.phone, a.city, passwordHash, a.joined_date],
  );
  return res.insertId;
}

async function upsertBook(conn, userId, b) {
  const isPublished = b.status === 'Published & Live';
  const data = {
    book_id: b.book_id, author_user_id: userId, title: b.title, isbn: b.isbn ?? null, genre: b.genre ?? null,
    publication_date: b.publication_date ?? null, status: b.status, is_published: isPublished ? 1 : 0,
    mrp: b.mrp ?? null, author_royalty_per_copy: b.author_royalty_per_copy ?? null,
    total_copies_sold: b.total_copies_sold ?? 0, total_royalty_earned: b.total_royalty_earned ?? 0,
    royalty_paid: b.royalty_paid ?? 0, royalty_pending: b.royalty_pending ?? 0,
    last_royalty_payout_date: b.last_royalty_payout_date ?? null, print_partner: b.print_partner ?? null,
    available_on: JSON.stringify(b.available_on || []),
  };
  const [existing] = await conn.execute('SELECT id FROM books WHERE book_id = ? LIMIT 1', [data.book_id]);
  if (existing.length) {
    await conn.execute(
      `UPDATE books SET author_user_id=?, title=?, isbn=?, genre=?, publication_date=?, status=?, is_published=?,
        mrp=?, author_royalty_per_copy=?, total_copies_sold=?, total_royalty_earned=?, royalty_paid=?,
        royalty_pending=?, last_royalty_payout_date=?, print_partner=?, available_on=? WHERE id=?`,
      [data.author_user_id, data.title, data.isbn, data.genre, data.publication_date, data.status,
        data.is_published, data.mrp, data.author_royalty_per_copy, data.total_copies_sold,
        data.total_royalty_earned, data.royalty_paid, data.royalty_pending, data.last_royalty_payout_date,
        data.print_partner, data.available_on, existing[0].id],
    );
    return existing[0].id;
  }
  const [res] = await conn.execute(
    `INSERT INTO books (book_id, author_user_id, title, isbn, genre, publication_date, status, is_published,
      mrp, author_royalty_per_copy, total_copies_sold, total_royalty_earned, royalty_paid, royalty_pending,
      last_royalty_payout_date, print_partner, available_on)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    Object.values(data),
  );
  return res.insertId;
}

async function seedDemoTickets(conn, bookRefs) {
  // Demo tickets are clearly marked and only created once (checked by reference).
  const tickets = [
    {
      reference: 'BL-TCK-000001', bookCode: 'BK005', subject: 'Royalty payment not received for Q3',
      description: 'My dashboard shows ₹2,546 in pending royalties for Between Two Temples but I have never received any payout. It has been well past 45 days since the quarter ended. Please check whether the payment was missed.',
      authorEmail: 'ananya.reddy@email.com', category: 'Royalty & Payments', priority: 'High',
      status: 'In Progress', note: 'Verified no payout record on our side — rolling balance crossed ₹1,000 threshold this quarter. Escalated to finance for confirmation before committing to a date.',
      reply: 'Dear Ananya, thank you for flagging this and I am sorry for the delay you have experienced. Your royalty of ₹2,546 had been below the ₹1,000 per-cycle payout visibility earlier and rolled over as per our policy; balances above the threshold are paid by bank transfer within 45 days of quarter-end to the account linked in your dashboard. Our team is verifying your current payout status with the finance department and will follow up with confirmed details. In the meantime, please confirm your linked bank account in the dashboard. — BookLeaf Author Support',
    },
    {
      reference: 'BL-TCK-000002', bookCode: 'BK004', subject: 'Wrong ISBN showing on Amazon listing',
      description: 'The ISBN displayed for Startup Sutra on Amazon does not match the one in my dashboard. This looks like a duplicate or incorrect mapping and customers may be buying the wrong edition. This needs urgent fixing.',
      authorEmail: 'rohit.kapoor@email.com', category: 'ISBN & Metadata Issues', priority: 'Critical',
      status: 'Open', note: null, reply: null,
    },
    {
      reference: 'BL-TCK-000003', bookCode: 'BK013', subject: 'Update my author bio',
      description: 'I would like to update my short author biography on the platform profile page. Nothing urgent, just a small correction to my latest credentials whenever convenient.',
      authorEmail: 'sneha.kulkarni@email.com', category: 'General Inquiry', priority: 'Low',
      status: 'Resolved',
      note: 'Simple metadata request, low urgency.',
      reply: 'Dear Sneha, thanks for reaching out! You can submit updated description/bio text through your dashboard or by emailing BookLeaf directly. Changes typically appear across platforms within 3–5 business days. If you would like us to make this specific edit, please send the revised bio text and we will action it. — BookLeaf Author Support',
    },
    {
      reference: 'BL-TCK-000004', bookCode: 'BK017', subject: 'Binding issue in recent copies',
      description: 'Several readers reported pages coming loose in recent copies of Durga\u2019s Daughters. I believe this is a binding defect and would like to understand reprint options.',
      authorEmail: 'diya.chatterjee@email.com', category: 'Printing & Quality', priority: 'Medium',
      status: 'Open', note: null, reply: null,
    },
  ];

  for (const t of tickets) {
    const [users] = await conn.execute('SELECT id FROM users WHERE email = ?', [t.authorEmail]);
    const [books] = await conn.execute('SELECT id FROM books WHERE book_id = ?', [t.bookCode]);
    const [admins] = await conn.execute("SELECT id FROM users WHERE role='admin' LIMIT 1");
    if (!users.length || !books.length) continue;
    const [exists] = await conn.execute('SELECT id FROM tickets WHERE reference = ?', [t.reference]);
    if (exists.length) continue; // idempotent

    const [res] = await conn.execute(
      `INSERT INTO tickets (reference, author_user_id, book_id, subject, description, category, category_source,
         priority, priority_source, status, assigned_admin_id, ai_processing_status)
       VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, 'manual', ?, ?, 'skipped')`,
      [t.reference, users[0].id, books[0].id, t.subject, t.description, t.category, t.priority, t.status,
        t.status === 'Open' ? null : (admins[0]?.id ?? null)],
    );
    const ticketId = res.insertId;
    await conn.execute('INSERT INTO ticket_events (ticket_id, actor_user_id, event) VALUES (?, ?, "created")', [ticketId, users[0].id]);
    if (t.note && admins.length) {
      await conn.execute(
        'INSERT INTO messages (ticket_id, sender_user_id, kind, body, visible_to_author) VALUES (?, ?, "internal_note", ?, 0)',
        [ticketId, admins[0].id, t.note],
      );
    }
    if (t.reply && admins.length) {
      await conn.execute(
        'INSERT INTO messages (ticket_id, sender_user_id, kind, body, visible_to_author) VALUES (?, ?, "public_reply", ?, 1)',
        [ticketId, admins[0].id, t.reply],
      );
    }
  }
  return tickets.length;
}

async function main() {
  const dataset = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const conn = await ensureDatabase();

  const authorPassword = config.seed.authorPassword || 'Author@123';
  const adminPassword = config.seed.adminPassword || 'Admin@123';
  const rounds = config.bcryptRounds;

  // Admin account (safe seed process — no public signup for admins).
  const adminHash = await bcrypt.hash(adminPassword, rounds);
  const [adminExists] = await conn.execute("SELECT id FROM users WHERE email = ?", ['admin@bookleafpublishing.com']);
  if (!adminExists.length) {
    await conn.execute(
      `INSERT INTO users (name, email, role, password_hash) VALUES ('Support Admin', 'admin@bookleafpublishing.com', 'admin', ?)`,
      [adminHash],
    );
    console.log('Created admin: admin@bookleafpublishing.com');
  } else {
    console.log('Admin already exists (left untouched)');
  }

  const authorHash = await bcrypt.hash(authorPassword, rounds);
  let bookCount = 0;
  const bookRefs = [];
  for (const a of dataset.authors) {
    const userId = await upsertAuthor(conn, a, authorHash);
    for (const b of a.books) {
      const bookRowId = await upsertBook(conn, userId, b);
      bookRefs.push({ ...b, rowId: bookRowId, userId });
      bookCount += 1;
    }
  }
  console.log(`Seeded ${dataset.authors.length} authors and ${bookCount} books.`);

  if ((process.env.SEED_DEMO_TICKETS || 'true').toLowerCase() !== 'false') {
    const n = await seedDemoTickets(conn, bookRefs);
    console.log(`Ensured ${n} demo tickets.`);
  }

  // Verification summary (proves idempotency numbers on rerun).
  const [[u]] = await conn.query('SELECT COUNT(*) c FROM users');
  const [[b]] = await conn.query('SELECT COUNT(*) c FROM books');
  const [[t]] = await conn.query('SELECT COUNT(*) c FROM tickets');
  console.log(`Final counts -> users: ${u.c}, books: ${b.c}, tickets: ${t.c}`);
  await conn.end();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
