export function ok(res, data, meta = undefined) {
  return res.json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function created(res, data) {
  return res.status(201).json({ success: true, data });
}

export function fail(res, err, isProduction = false) {
  const status = err.statusCode || 500;
  const statusCodes = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    429: 'RATE_LIMITED',
    500: 'INTERNAL_ERROR',
    502: 'UPSTREAM_ERROR',
    503: 'SERVICE_UNAVAILABLE',
  };
  const body = {
    success: false,
    error: {
      code: err.code || statusCodes[status] || 'REQUEST_FAILED',
      message: status >= 500 && isProduction ? 'Internal server error' : err.message,
    },
  };
  if (err.details) body.error.details = err.details;
  return res.status(status).json(body);
}
