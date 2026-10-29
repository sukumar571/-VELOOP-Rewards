/**
 * validate — Zod-powered request validation.
 *
 * Usage: router.get('/x', validate({ query: listSchema }), controller)
 * Parsed (and coerced/trimmed) values are exposed on req.valid.<part>; the parsed
 * body additionally replaces req.body so handlers read validated, safe values.
 * A ZodError becomes a single 400 with per-field details — nothing unvalidated
 * ever reaches a controller or the database.
 */
const { ZodError } = require('zod');
const { ApiError } = require('../utils/ApiError.js');

function formatZod(error) {
  const details = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    if (!details[key]) details[key] = issue.message;
  }
  return details;
}

function validate(schemas = {}) {
  return function run(req, res, next) {
    req.valid = {};
    try {
      for (const part of ['body', 'query', 'params']) {
        const schema = schemas[part];
        if (!schema) continue;
        const parsed = schema.parse(req[part] ?? {});
        req.valid[part] = parsed;
        if (part === 'body') req.body = parsed;
      }
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(
          new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed.', formatZod(err)),
        );
      }
      return next(err);
    }
  };
}

module.exports = { validate, formatZod };
