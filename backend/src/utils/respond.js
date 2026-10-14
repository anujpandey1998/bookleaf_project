export function ok(res, data, meta = undefined) {
  return res.json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function created(res, data) {
  return res.status(201).json({ success: true, data });
}

export function fail(res, err, isProduction = false) {
  const status = err.statusCode || 500;
  const body = {
    success: false,
    error: {
      message: status >= 500 && isProduction ? 'Internal server error' : err.message,
    },
  };
  if (err.details) body.error.details = err.details;
  return res.status(status).json(body);
}
