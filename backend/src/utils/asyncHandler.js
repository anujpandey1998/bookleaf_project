// Wraps async route handlers so thrown errors reach the central Express error handler.
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
