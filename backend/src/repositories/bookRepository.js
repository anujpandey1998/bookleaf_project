import { query } from '../config/db.js';

const BOOK_FIELDS = `id, book_id, author_user_id, title, isbn, genre, publication_date, status,
  is_published, mrp, author_royalty_per_copy, total_copies_sold, total_royalty_earned,
  royalty_paid, royalty_pending, last_royalty_payout_date, print_partner, available_on`;

export async function listBooksByAuthor(authorUserId) {
  return query(
    `SELECT ${BOOK_FIELDS} FROM books WHERE author_user_id = ? ORDER BY publication_date DESC, id ASC`,
    [authorUserId],
  );
}

export async function findBookById(id) {
  const rows = await query(`SELECT ${BOOK_FIELDS} FROM books WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

export async function findBookByCode(bookId) {
  const rows = await query(`SELECT ${BOOK_FIELDS} FROM books WHERE book_id = ? LIMIT 1`, [bookId]);
  return rows[0] || null;
}

export async function createBook(data) {
  const result = await query(
    `INSERT INTO books (book_id, author_user_id, title, isbn, genre, publication_date, status, is_published,
      mrp, author_royalty_per_copy, total_copies_sold, total_royalty_earned, royalty_paid, royalty_pending,
      last_royalty_payout_date, print_partner, available_on)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.book_id, data.author_user_id, data.title, data.isbn ?? null, data.genre ?? null,
      data.publication_date ?? null, data.status, data.is_published ? 1 : 0,
      data.mrp ?? null, data.author_royalty_per_copy ?? null,
      data.total_copies_sold ?? 0, data.total_royalty_earned ?? 0,
      data.royalty_paid ?? 0, data.royalty_pending ?? 0,
      data.last_royalty_payout_date ?? null, data.print_partner ?? null,
      data.available_on ? JSON.stringify(data.available_on) : null,
    ],
  );
  return result.insertId;
}

export async function updateBook(data) {
  await query(
    `UPDATE books SET title=?, isbn=?, genre=?, publication_date=?, status=?, is_published=?,
       mrp=?, author_royalty_per_copy=?, total_copies_sold=?, total_royalty_earned=?,
       royalty_paid=?, royalty_pending=?, last_royalty_payout_date=?, print_partner=?, available_on=?
     WHERE book_id=?`,
    [
      data.title, data.isbn ?? null, data.genre ?? null,
      data.publication_date ?? null, data.status, data.is_published ? 1 : 0,
      data.mrp ?? null, data.author_royalty_per_copy ?? null,
      data.total_copies_sold ?? 0, data.total_royalty_earned ?? 0,
      data.royalty_paid ?? 0, data.royalty_pending ?? 0,
      data.last_royalty_payout_date ?? null, data.print_partner ?? null,
      data.available_on ? JSON.stringify(data.available_on) : null,
      data.book_id,
    ],
  );
}

export async function getAuthorRoyaltySummary(authorUserId) {
  const rows = await query(
    `SELECT COUNT(*) AS total_books,
            SUM(is_published = 1) AS published_books,
            SUM(is_published = 0) AS in_production_books,
            COALESCE(SUM(total_copies_sold),0) AS total_copies_sold,
            COALESCE(SUM(total_royalty_earned),0) AS total_royalty_earned,
            COALESCE(SUM(royalty_paid),0) AS royalty_paid,
            COALESCE(SUM(royalty_pending),0) AS royalty_pending
     FROM books WHERE author_user_id = ?`,
    [authorUserId],
  );
  return rows[0];
}
