import { query } from '../config/db.js';

const PUBLIC_USER_FIELDS = 'id, author_id, name, email, phone, city, role, joined_date, created_at';

export async function findUserByEmail(email) {
  const rows = await query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
  return rows[0] || null;
}

export async function findUserById(id) {
  const rows = await query(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

export async function createUser({ authorId, name, email, phone, city, role, passwordHash, joinedDate }) {
  const result = await query(
    `INSERT INTO users (author_id, name, email, phone, city, role, password_hash, joined_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [authorId ?? null, name, email.toLowerCase(), phone ?? null, city ?? null, role, passwordHash, joinedDate ?? null],
  );
  return findUserById(result.insertId);
}

export async function listAdmins() {
  return query(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE role = 'admin' ORDER BY id`);
}
