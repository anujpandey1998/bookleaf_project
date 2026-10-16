import { getPool, query } from '../config/db.js';

const BOOK_FIELDS = `b.id, b.book_id, b.author_user_id, b.title, b.isbn, b.genre, b.publication_date, b.status,
  b.is_published, b.mrp, b.author_royalty_per_copy, b.total_copies_sold, b.total_royalty_earned,
  b.royalty_paid, GREATEST(b.total_royalty_earned - b.royalty_paid, 0) AS royalty_pending,
  b.last_royalty_payout_date, b.print_partner,
  COALESCE((SELECT JSON_ARRAYAGG(bp.platform) FROM book_platforms bp WHERE bp.book_id = b.id), JSON_ARRAY()) AS available_on`;

export async function listBooksByAuthor(authorUserId) {
  return query(
    `SELECT ${BOOK_FIELDS} FROM books b
     WHERE b.author_user_id = ? ORDER BY b.publication_date DESC, b.id ASC`,
    [authorUserId],
  );
}

export async function findBookById(id) {
  const rows = await query(`SELECT ${BOOK_FIELDS} FROM books b WHERE b.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

export async function findBookByCode(bookId) {
  const rows = await query(`SELECT ${BOOK_FIELDS} FROM books b WHERE b.book_id = ? LIMIT 1`, [bookId]);
  return rows[0] || null;
}

export async function createBook(data) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      `INSERT INTO books (book_id, author_user_id, title, isbn, genre, publication_date, status, is_published,
        mrp, author_royalty_per_copy, total_copies_sold, total_royalty_earned, royalty_paid,
        last_royalty_payout_date, print_partner)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.book_id, data.author_user_id, data.title, data.isbn ?? null, data.genre ?? null,
        data.publication_date ?? null, data.status, data.is_published ? 1 : 0,
        data.mrp ?? null, data.author_royalty_per_copy ?? null,
        data.total_copies_sold ?? 0, data.total_royalty_earned ?? 0,
        data.royalty_paid ?? 0, data.last_royalty_payout_date ?? null, data.print_partner ?? null,
      ],
    );
    await replaceBookPlatforms(conn, result.insertId, data.available_on || []);
    await conn.commit();
    return result.insertId;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function updateBook(data) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT id FROM books WHERE book_id = ? LIMIT 1', [data.book_id]);
    if (!rows[0]) throw new Error(`Book not found: ${data.book_id}`);
    await conn.execute(
      `UPDATE books SET title=?, isbn=?, genre=?, publication_date=?, status=?, is_published=?,
         mrp=?, author_royalty_per_copy=?, total_copies_sold=?, total_royalty_earned=?,
         royalty_paid=?, last_royalty_payout_date=?, print_partner=? WHERE id=?`,
      [
        data.title, data.isbn ?? null, data.genre ?? null,
        data.publication_date ?? null, data.status, data.is_published ? 1 : 0,
        data.mrp ?? null, data.author_royalty_per_copy ?? null,
        data.total_copies_sold ?? 0, data.total_royalty_earned ?? 0,
        data.royalty_paid ?? 0, data.last_royalty_payout_date ?? null,
        data.print_partner ?? null, rows[0].id,
      ],
    );
    await replaceBookPlatforms(conn, rows[0].id, data.available_on || []);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function replaceBookPlatforms(conn, bookId, platforms) {
  await conn.execute('DELETE FROM book_platforms WHERE book_id = ?', [bookId]);
  for (const platform of platforms) {
    await conn.execute('INSERT INTO book_platforms (book_id, platform) VALUES (?, ?)', [bookId, platform]);
  }
}

export async function getAuthorRoyaltySummary(authorUserId) {
  const rows = await query(
    `SELECT COUNT(*) AS total_books,
            SUM(is_published = 1) AS published_books,
            SUM(is_published = 0) AS in_production_books,
            COALESCE(SUM(total_copies_sold),0) AS total_copies_sold,
            COALESCE(SUM(total_royalty_earned),0) AS total_royalty_earned,
            COALESCE(SUM(royalty_paid),0) AS royalty_paid,
            COALESCE(SUM(GREATEST(total_royalty_earned - royalty_paid, 0)),0) AS royalty_pending
     FROM books WHERE author_user_id = ?`,
    [authorUserId],
  );
  return rows[0];
}
