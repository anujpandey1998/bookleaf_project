import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { config } from './config/env.js';
import { router } from './routes/api.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { openApiSpec } from './docs/openapi.js';
import { query } from './config/db.js';
import { asyncHandler } from './utils/asyncHandler.js';
import { AppError } from './utils/errors.js';

export function createApp() {
  const app = express();
  const allowedOrigins = config.clientOrigin.split(',').map((origin) => new URL(origin.trim()).origin);
  if (config.env !== 'production') {
    for (const origin of [...allowedOrigins]) {
      const url = new URL(origin);
      if (url.hostname === 'localhost') {
        url.hostname = '127.0.0.1';
        allowedOrigins.push(url.origin);
      } else if (url.hostname === '127.0.0.1') {
        url.hostname = 'localhost';
        allowedOrigins.push(url.origin);
      }
    }
  }

  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use((req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const hasSessionCookie = req.headers.cookie?.split(';')
      .some((cookie) => cookie.trim().startsWith('bookleaf_session='));
    const originIsMissingForCookie = hasSessionCookie && !req.headers.origin;
    const originIsNotAllowed = req.headers.origin && !allowedOrigins.includes(req.headers.origin);
    if (originIsMissingForCookie || originIsNotAllowed) {
      return res.status(403).json({
        success: false,
        error: { code: 'ORIGIN_FORBIDDEN', message: 'Request origin is not allowed' },
      });
    }
    return next();
  });

  app.get('/api/v1/health', asyncHandler(async (_req, res) => {
    try {
      await query('SELECT 1');
    } catch (error) {
      // Keep diagnostics useful without exposing connection details or credentials.
      // eslint-disable-next-line no-console
      console.error('[health] Database check failed:', error.code || 'DB_ERROR');
      throw new AppError(503, 'Database unavailable', undefined, 'DATABASE_UNAVAILABLE');
    }
    return res.json({ success: true, data: { status: 'ok', database: 'ok', time: new Date().toISOString() } });
  }));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'BookLeaf API Docs' }));
  app.get('/api/openapi.json', (req, res) => res.json(openApiSpec));

  app.use('/api/v1', router);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
