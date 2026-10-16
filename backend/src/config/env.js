import dotenv from 'dotenv';

dotenv.config();

const required = ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET', 'CLIENT_ORIGIN'];

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  authCookieSameSite: process.env.AUTH_COOKIE_SAME_SITE || 'Lax',
  authCookieSecure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bookleaf',
  },
  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10),
  seed: {
    authorPassword: process.env.SEED_AUTHOR_PASSWORD || '',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || '',
  },
  ai: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    maxTokens: Number(process.env.AI_MAX_TOKENS || 1200),
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 30000),
    maxRetries: Number(process.env.AI_MAX_RETRIES ?? 2),
  },
};

export function assertConfig() {
  if (!['Lax', 'Strict', 'None'].includes(config.authCookieSameSite)) {
    throw new Error('AUTH_COOKIE_SAME_SITE must be Lax, Strict, or None');
  }
  if (config.env === 'production') {
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    if (config.jwt.secret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters for production use');
    }
    if (config.authCookieSameSite === 'None' && !config.authCookieSecure) {
      throw new Error('Secure cookies are required when AUTH_COOKIE_SAME_SITE=None');
    }
  }
}
