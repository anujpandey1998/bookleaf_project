import mysql from 'mysql2/promise';
import { config } from './env.js';

let pool = null;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      dateStrings: false,
    });
    pool.pool.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('MySQL pool error:', err.message);
    });
  }
  return pool;
}

export async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// Connect with bounded retries so a slow DB start doesn't crash the app.
export async function connectWithRetry({ retries = 5, delayMs = 2000 } = {}) {
  let lastError;
  for (let i = 0; i < retries; i += 1) {
    try {
      const conn = await mysql.createConnection({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password,
      });
      await conn.ping();
      await conn.end();
      return true;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}
