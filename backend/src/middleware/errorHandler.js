import { config } from '../config/env.js';
import { fail } from '../utils/respond.js';

// eslint-disable-next-line no-unused-vars
export function notFoundHandler(req, res, next) {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.statusCode = 404;
  return next(err);
}

export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (!(err.statusCode >= 400 && err.statusCode < 600)) {
    // Log unexpected errors server-side only; never leak stack traces to clients.
    // eslint-disable-next-line no-console
    console.error('[error]', err.stack || err.message);
  }
  return fail(res, err, config.env === 'production');
}
