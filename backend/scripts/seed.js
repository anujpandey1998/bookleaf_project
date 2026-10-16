import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { config } from '../src/config/env.js';
import { validateSeedData } from './seedData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data', 'bookleaf_sample_data.json');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');
const DEMO_ADMINS = [
  { email: 'admin@bookleafpublishing.com', name: 'Support Admin' },
  { email: 'operations@bookleafpublishing.com', name: 'Operations Admin' },
];

function toCents(value) {
  return Math.round(Number(value) * 100);
}

function dateValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

async function tableColumns(conn, tableName) {
  const [rows] = await conn.execute(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName],
  );
  return new Set(rows.map((row) => row.COLUMN_NAME));
}

async function migrateLegacyUsers(conn) {
  const columns = await tableColumns(conn, 'users');
  if (columns.has('author_id')) {
    const [users] = await conn.query(
      `SELECT id, author_id, phone, city, joined_date FROM users WHERE author_id IS NOT NULL`,
    );
    for (const user of users) {
      await conn.execute(
        `INSERT INTO authors (user_id, author_code, phone, city, joined_date)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE author_code=VALUES(author_code), phone=VALUES(phone),
           city=VALUES(city), joined_date=VALUES(joined_date)`,
        [user.id, user.author_id, user.phone, user.city, user.joined_date],
      );
    }
    await conn.query('ALTER TABLE users DROP COLUMN author_id, DROP COLUMN phone, DROP COLUMN city, DROP COLUMN joined_date');
  }

  const [roles] = await conn.query("SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='role'");
  if (!roles.length) throw new Error('The users table is missing its role column');
  if (!roles[0].COLUMN_TYPE.includes("'AUTHOR'") || !roles[0].COLUMN_TYPE.includes("'ADMIN'")) {
    await conn.query('ALTER TABLE users MODIFY COLUMN role VARCHAR(20) NOT NULL');
    await conn.query(
      `UPDATE users SET role = CASE LOWER(role)
        WHEN 'author' THEN 'AUTHOR' WHEN 'admin' THEN 'ADMIN' ELSE role END`,
    );
    const [unknownRoles] = await conn.query("SELECT DISTINCT role FROM users WHERE role NOT IN ('AUTHOR','ADMIN')");
    if (unknownRoles.length) {
      throw new Error(`Cannot migrate unsupported user role: ${unknownRoles[0].role}`);
    }
    await conn.query("ALTER TABLE users MODIFY COLUMN role ENUM('AUTHOR','ADMIN') NOT NULL");
  }
}

async function migrateLegacyBooks(conn) {
  const columns = await tableColumns(conn, 'books');
  if (columns.has('available_on')) {
    const [books] = await conn.query('SELECT id, available_on FROM books');
    for (const book of books) {
      let platforms = book.available_on;
      if (typeof platforms === 'string') {
        try {
          platforms = JSON.parse(platforms);
        } catch {
          throw new Error(`Cannot migrate invalid platform data for book row ${book.id}`);
        }
      }
      if (platforms === null) platforms = [];
      if (!Array.isArray(platforms) || platforms.some((platform) => typeof platform !== 'string')) {
        throw new Error(`Cannot migrate invalid platform data for book row ${book.id}`);
      }
      for (const platform of platforms) {
        await conn.execute(
          'INSERT IGNORE INTO book_platforms (book_id, platform) VALUES (?, ?)',
          [book.id, platform],
        );
      }
    }
    await conn.query('ALTER TABLE books DROP COLUMN available_on');
  }

  if (columns.has('royalty_pending')) {
    const [books] = await conn.query(
      'SELECT book_id, total_royalty_earned, royalty_paid, royalty_pending FROM books',
    );
    const mismatch = books.find(
      (book) => toCents(book.royalty_paid) > toCents(book.total_royalty_earned)
        || toCents(book.total_royalty_earned) - toCents(book.royalty_paid) !== toCents(book.royalty_pending),
    );
    if (mismatch) {
      throw new Error(`Cannot remove stored royalty_pending: source totals do not reconcile for ${mismatch.book_id}`);
    }
    await conn.query('ALTER TABLE books DROP COLUMN royalty_pending');
  }
}

async function ensureAuthorForeignKeys(conn) {
  for (const table of ['books', 'tickets']) {
    const [keys] = await conn.execute(
      `SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='author_user_id'
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [table],
    );
    const current = keys.find((key) => key.REFERENCED_TABLE_NAME !== 'authors');
    if (current) {
      await conn.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${current.CONSTRAINT_NAME}\``);
    }
    if (!keys.some((key) => key.REFERENCED_TABLE_NAME === 'authors')) {
      const constraint = table === 'books' ? 'fk_books_author' : 'fk_tickets_author';
      await conn.query(
        `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${constraint}\`
         FOREIGN KEY (author_user_id) REFERENCES authors(user_id)`,
      );
    }
  }
}

async function migrateLegacyTickets(conn) {
  const responseColumns = await tableColumns(conn, 'ticket_responses');
  if (responseColumns.has('admin_user_id') && !responseColumns.has('sender_user_id')) {
    await conn.query(
      'ALTER TABLE ticket_responses CHANGE admin_user_id sender_user_id INT UNSIGNED NOT NULL',
    );
  }
  const messageColumns = await tableColumns(conn, 'messages');
  if (messageColumns.size) {
    const [messages] = await conn.query(
      'SELECT id, ticket_id, sender_user_id, kind, body, created_at FROM messages ORDER BY id',
    );
    for (const message of messages) {
      const table = message.kind === 'internal_note' ? 'internal_notes' : 'ticket_responses';
      const senderColumn = message.kind === 'internal_note' ? 'admin_user_id' : 'sender_user_id';
      if (message.kind !== 'internal_note' && message.kind !== 'public_reply') {
        throw new Error(`Cannot migrate unsupported message type: ${message.kind}`);
      }
      await conn.execute(
        `INSERT IGNORE INTO ${table} (id, ticket_id, ${senderColumn}, body, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [message.id, message.ticket_id, message.sender_user_id, message.body, message.created_at],
      );
    }
    await conn.query('DROP TABLE messages');
  }

  const ticketColumns = await tableColumns(conn, 'tickets');
  if (ticketColumns.has('ai_draft')) {
    const [tickets] = await conn.query(
      `SELECT id, ai_draft, ai_model, ai_draft_generated_at, updated_at
       FROM tickets WHERE ai_draft IS NOT NULL`,
    );
    for (const ticket of tickets) {
      await conn.execute(
        `INSERT INTO ticket_drafts (ticket_id, body, model, generated_at)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE body=VALUES(body), model=VALUES(model), generated_at=VALUES(generated_at)`,
        [ticket.id, ticket.ai_draft, ticket.ai_model, ticket.ai_draft_generated_at || ticket.updated_at],
      );
    }
    await conn.query('ALTER TABLE tickets DROP COLUMN ai_draft, DROP COLUMN ai_draft_generated_at');
  }
}

async function ensureDatabase() {
  if (!/^[A-Za-z0-9_]+$/.test(config.db.database)) {
    throw new Error('DB_NAME may contain only letters, numbers, and underscores');
  }
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await conn.changeUser({ database: config.db.database });
    const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf8').replace(/^--.*$/gm, '');
    await conn.query(schemaSql);
    await migrateLegacyUsers(conn);
    await ensureAuthorForeignKeys(conn);
    await migrateLegacyBooks(conn);
    await migrateLegacyTickets(conn);
    return conn;
  } catch (error) {
    await conn.end();
    throw error;
  }
}

async function upsertUser(conn, { name, email, role, passwordHash }) {
  const normalizedEmail = email.toLowerCase();
  const [existing] = await conn.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [normalizedEmail]);
  if (existing.length) {
    await conn.execute(
      'UPDATE users SET name = ?, role = ?, password_hash = ? WHERE id = ?',
      [name, role, passwordHash, existing[0].id],
    );
    return existing[0].id;
  }
  const [result] = await conn.execute(
    'INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, ?)',
    [name, normalizedEmail, role, passwordHash],
  );
  return result.insertId;
}

async function upsertAuthor(conn, author, passwordHash) {
  const userId = await upsertUser(conn, {
    name: author.name,
    email: author.email,
    role: 'AUTHOR',
    passwordHash,
  });
  const [existing] = await conn.execute(
    'SELECT user_id FROM authors WHERE author_code = ? LIMIT 1',
    [author.author_id],
  );
  if (existing.length && existing[0].user_id !== userId) {
    throw new Error(`Author ID ${author.author_id} is already linked to a different account`);
  }
  await conn.execute(
    `INSERT INTO authors (user_id, author_code, phone, city, joined_date)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE author_code=VALUES(author_code), phone=VALUES(phone),
       city=VALUES(city), joined_date=VALUES(joined_date)`,
    [userId, author.author_id, author.phone, author.city, author.joined_date],
  );
  return userId;
}

async function upsertBook(conn, authorUserId, book) {
  const [existing] = await conn.execute('SELECT id FROM books WHERE book_id = ? LIMIT 1', [book.book_id]);
  let bookRowId;
  const values = [
    authorUserId, book.title, book.isbn, book.genre, book.publication_date, book.status,
    book.status === 'Published & Live' ? 1 : 0, book.mrp, book.author_royalty_per_copy,
    book.total_copies_sold, book.total_royalty_earned, book.royalty_paid,
    book.last_royalty_payout_date, book.print_partner,
  ];
  if (existing.length) {
    bookRowId = existing[0].id;
    await conn.execute(
      `UPDATE books SET author_user_id=?, title=?, isbn=?, genre=?, publication_date=?, status=?, is_published=?,
        mrp=?, author_royalty_per_copy=?, total_copies_sold=?, total_royalty_earned=?, royalty_paid=?,
        last_royalty_payout_date=?, print_partner=? WHERE id=?`,
      [...values, bookRowId],
    );
  } else {
    const [result] = await conn.execute(
      `INSERT INTO books (author_user_id, book_id, title, isbn, genre, publication_date, status, is_published,
        mrp, author_royalty_per_copy, total_copies_sold, total_royalty_earned, royalty_paid,
        last_royalty_payout_date, print_partner)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [authorUserId, book.book_id, ...values.slice(1)],
    );
    bookRowId = result.insertId;
  }

  await conn.execute('DELETE FROM book_platforms WHERE book_id = ?', [bookRowId]);
  for (const platform of book.available_on) {
    await conn.execute(
      'INSERT INTO book_platforms (book_id, platform) VALUES (?, ?)',
      [bookRowId, platform],
    );
  }
}

async function verifySeed(conn, dataset) {
  for (const author of dataset.authors) {
    const [authors] = await conn.execute(
      `SELECT u.name, u.email, u.role, a.phone, a.city,
         DATE_FORMAT(a.joined_date, '%Y-%m-%d') AS joined_date
       FROM authors a JOIN users u ON u.id = a.user_id WHERE a.author_code = ?`,
      [author.author_id],
    );
    const row = authors[0];
    if (!row || row.name !== author.name || row.email !== author.email.toLowerCase() || row.role !== 'AUTHOR'
      || row.phone !== author.phone || row.city !== author.city
      || dateValue(row.joined_date) !== dateValue(author.joined_date)) {
      throw new Error(`Seed verification failed for author ${author.author_id}`);
    }

    for (const book of author.books) {
      const [books] = await conn.execute(
        `SELECT b.id, b.book_id, b.author_user_id, b.title, b.isbn, b.genre,
           DATE_FORMAT(b.publication_date, '%Y-%m-%d') AS publication_date,
           b.status, b.is_published, b.mrp, b.author_royalty_per_copy, b.total_copies_sold,
           b.total_royalty_earned, b.royalty_paid,
           DATE_FORMAT(b.last_royalty_payout_date, '%Y-%m-%d') AS last_royalty_payout_date,
           b.print_partner, a.author_code,
           GREATEST(b.total_royalty_earned - b.royalty_paid, 0) AS royalty_pending
         FROM books b
         JOIN authors a ON a.user_id = b.author_user_id
         WHERE b.book_id = ?`,
        [book.book_id],
      );
      const actual = books[0];
      if (!actual
        || actual.author_code !== author.author_id
        || actual.title !== book.title
        || actual.isbn !== book.isbn
        || actual.genre !== book.genre
        || actual.status !== book.status
        || Number(actual.is_published) !== (book.status === 'Published & Live' ? 1 : 0)
        || (actual.mrp === null ? null : toCents(actual.mrp)) !== (book.mrp === null ? null : toCents(book.mrp))
        || (actual.author_royalty_per_copy === null ? null : toCents(actual.author_royalty_per_copy))
          !== (book.author_royalty_per_copy === null ? null : toCents(book.author_royalty_per_copy))
        || Number(actual.total_copies_sold) !== book.total_copies_sold
        || toCents(actual.total_royalty_earned) !== toCents(book.total_royalty_earned)
        || toCents(actual.royalty_paid) !== toCents(book.royalty_paid)
        || toCents(actual.royalty_pending) !== toCents(book.royalty_pending)
        || dateValue(actual.publication_date) !== dateValue(book.publication_date)
        || dateValue(actual.last_royalty_payout_date) !== dateValue(book.last_royalty_payout_date)
        || actual.print_partner !== book.print_partner) {
        throw new Error(`Seed verification failed for book ${book.book_id}`);
      }
      const [platformRows] = await conn.execute(
        'SELECT platform FROM book_platforms WHERE book_id = ? ORDER BY platform',
        [actual.id],
      );
      const expectedPlatforms = [...book.available_on].sort();
      if (JSON.stringify(platformRows.map((item) => item.platform)) !== JSON.stringify(expectedPlatforms)) {
        throw new Error(`Seed verification failed for platforms on ${book.book_id}`);
      }
    }
  }

  const [admins] = await conn.execute(
    `SELECT COUNT(*) AS total FROM users WHERE role='ADMIN' AND email IN (?, ?)`,
    DEMO_ADMINS.map((admin) => admin.email),
  );
  if (Number(admins[0].total) !== DEMO_ADMINS.length) {
    throw new Error('Seed verification failed for the two demo administrator accounts');
  }
}

async function main() {
  const dataset = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const counts = validateSeedData(dataset);
  if (!config.seed.authorPassword || !config.seed.adminPassword) {
    throw new Error('Set SEED_AUTHOR_PASSWORD and SEED_ADMIN_PASSWORD in backend/.env before seeding');
  }

  const authorHash = await bcrypt.hash(config.seed.authorPassword, config.bcryptRounds);
  const adminHash = await bcrypt.hash(config.seed.adminPassword, config.bcryptRounds);
  const conn = await ensureDatabase();
  try {
    await conn.beginTransaction();
    for (const admin of DEMO_ADMINS) {
      await upsertUser(conn, { ...admin, role: 'ADMIN', passwordHash: adminHash });
    }

    for (const author of dataset.authors) {
      const userId = await upsertAuthor(conn, author, authorHash);
      for (const book of author.books) {
        await upsertBook(conn, userId, book);
      }
    }
    await verifySeed(conn, dataset);
    await conn.commit();
    console.log(`Seed verified: ${counts.authorCount} authors, ${counts.bookCount} books, 2 admin accounts.`);
    console.log('Ticket records are not fabricated; use the application to create tickets.');
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(`Seed failed: ${error.message}`);
  process.exitCode = 1;
});
