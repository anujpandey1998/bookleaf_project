import multer from 'multer';
import { config } from '../config/env.js';
import { fail } from '../utils/respond.js';
import { AppError } from '../utils/errors.js';

// eslint-disable-next-line no-unused-vars
export function notFoundHandler(req, res, next) {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.statusCode = 404;
  return next(err);
}

export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Each attachment must be 25 MB or smaller'
      : err.code === 'LIMIT_FILE_COUNT'
        ? 'You can upload up to 5 attachments at a time'
        : 'The uploaded files could not be accepted';
    err = new AppError(400, message, undefined, 'INVALID_UPLOAD');
  } else if (err.code === 'ER_DUP_ENTRY') {
    err = new AppError(409, 'A record with these details already exists', undefined, 'DUPLICATE_RECORD');
  } else if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    err = new AppError(400, 'A referenced record does not exist', undefined, 'INVALID_REFERENCE');
  } else if (err.code === 'ER_DATA_TOO_LONG' || err.code === 'ER_TRUNCATED_WRONG_VALUE') {
    err = new AppError(400, 'A provided value is invalid or too long', undefined, 'INVALID_VALUE');
  }
  if (!(err.statusCode >= 400 && err.statusCode < 600)) {
    // Log unexpected errors server-side only; never leak stack traces to clients.
    // eslint-disable-next-line no-console
    console.error('[error]', err.stack || err.message);
  }
  return fail(res, err, config.env === 'production');
}
