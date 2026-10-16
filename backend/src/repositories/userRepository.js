import { randomBytes } from 'node:crypto';
import { getPool, query } from '../config/db.js';

const PUBLIC_USER_FIELDS = `u.id, a.author_code AS author_id, u.name, u.email, a.phone, a.city,
  u.role, a.joined_date, u.created_at`;

export async function findUserByEmail(email) {
  const rows = await query(
    `SELECT u.*, a.author_code AS author_id, a.phone, a.city, a.joined_date
     FROM users u LEFT JOIN authors a ON a.user_id = u.id
     WHERE u.email = ? LIMIT 1`,
    [email],
  );
  return rows[0] || null;
}

export async function findUserById(id) {
  const rows = await query(
    `SELECT ${PUBLIC_USER_FIELDS} FROM users u LEFT JOIN authors a ON a.user_id = u.id
     WHERE u.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

export async function createUser({ name, email, role, passwordHash }) {
  const result = await query(
    'INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, ?)',
    [name, email.toLowerCase(), role, passwordHash],
  );
  return findUserById(result.insertId);
}

export async function createAuthorAccount({ name, email, passwordHash }) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [userResult] = await connection.execute(
      'INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, ?)',
      [name, email.toLowerCase(), 'AUTHOR', passwordHash],
    );
    const authorCode = `AUTH${randomBytes(6).toString('hex').toUpperCase()}`;
    await connection.execute(
      'INSERT INTO authors (user_id, author_code, joined_date) VALUES (?, ?, CURRENT_DATE)',
      [userResult.insertId, authorCode],
    );
    await connection.commit();
    return await findUserById(userResult.insertId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listAdmins() {
  return query(
    `SELECT ${PUBLIC_USER_FIELDS} FROM users u LEFT JOIN authors a ON a.user_id = u.id
     WHERE u.role = 'ADMIN' ORDER BY u.id`,
  );
}
