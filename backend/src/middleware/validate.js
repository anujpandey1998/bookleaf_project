import { badRequest } from '../utils/errors.js';

// Validates req.body (or query/params) against a zod schema; replaces the value with parsed data.
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      return next(badRequest('Validation failed', details));
    }
    if (source === 'query') {
      // keep original req.query read-only-safe by assigning parsed to req.validatedQuery
      req.validatedQuery = result.data;
      return next();
    }
    req[source] = result.data;
    return next();
  };
}
