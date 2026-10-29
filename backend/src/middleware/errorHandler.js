/**
 * errorHandler — the single place errors become HTTP responses.
 *
 * Normalizes ApiError, Zod, Mongoose (validation/cast/disconnected/duplicate),
 * body-parser (malformed/oversize) and JWT errors into a stable envelope:
 *   { error: { code, message, details? }, requestId }
 * Operational 4xx messages are safe to expose; unexpected 5xx are logged with the
 * stack internally and returned as a generic message in production (never leaks).
 */
const mongoose = require('mongoose');
const { ZodError } = require('zod');
const { ApiError } = require('../utils/ApiError.js');
const { config } = require('../config/index.js');
const { logger } = require('../config/logger.js');

function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found.`, undefined));
}

/** Translate any thrown error into { statusCode, code, message, details }. */
function normalize(err) {
  if (err instanceof ApiError) {
    return {
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
      details: err.details,
      expose: true,
    };
  }

  if (err instanceof ZodError) {
    const details = {};
    for (const i of err.issues) details[i.path.join('.') || '_'] = i.message;
    return { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Request validation failed.', details, expose: true };
  }

  // Malformed JSON body.
  if (err.type === 'entity.parse.failed') {
    return { statusCode: 400, code: 'INVALID_JSON', message: 'Request body is not valid JSON.', expose: true };
  }
  // Body exceeded the configured payload limit.
  if (err.type === 'entity.too.large') {
    return { statusCode: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.', expose: true };
  }

  // Mongoose validation error.
  if (err.name === 'ValidationError' && err.errors) {
    const details = {};
    for (const [k, v] of Object.entries(err.errors)) details[k] = v.message;
    return { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Document validation failed.', details, expose: true };
  }
  // Invalid ObjectId / cast failure on a path param.
  if (err.name === 'CastError') {
    return { statusCode: 400, code: 'INVALID_IDENTIFIER', message: 'Invalid resource identifier.', expose: true };
  }
  // Duplicate key (unique index) — e.g. the anti-double-charge invariant.
  if (err.code === 11000) {
    return { statusCode: 409, code: 'DUPLICATE_KEY', message: 'Resource already exists.', expose: true };
  }
  // Query attempted while MongoDB is not connected (bufferCommands is disabled).
  const msg = err.message || '';
  if (
    (err instanceof mongoose.Error || msg.includes('Mongoose')) &&
    /before initial connection|buffering timed out|disconnected|ECONNREFUSED/i.test(msg)
  ) {
    return {
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'The database is not reachable right now. Please retry shortly.',
      expose: true,
    };
  }

  // JSON Web Token failures (defensive; the auth adapter usually handles these).
  if (err.name === 'TokenExpiredError') {
    return { statusCode: 401, code: 'TOKEN_EXPIRED', message: 'Access token has expired.', expose: true };
  }
  if (err.name === 'JsonWebTokenError') {
    return { statusCode: 401, code: 'INVALID_TOKEN', message: 'Access token is invalid.', expose: true };
  }

  // Unknown / unexpected → 500.
  return {
    statusCode: err.statusCode || err.status || 500,
    code: 'INTERNAL_ERROR',
    message: err.message || 'Internal server error.',
    expose: false,
  };
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const { statusCode, code, message, details, expose } = normalize(err);

  const log = req.log || logger;
  const logFields = {
    err,
    statusCode,
    code,
    method: req.method,
    url: req.originalUrl,
    requestId: req.id,
  };
  if (statusCode >= 500) log.error(logFields, 'Unhandled request error');
  else log.warn({ ...logFields, err: undefined }, 'Request error');

  // Already-started responses (e.g. streaming) can't be safely rewritten.
  if (res.headersSent) return next(err);

  const safeMessage =
    statusCode >= 500 && config.isProduction && !expose
      ? 'Internal server error.'
      : message;

  return res.status(statusCode).json({
    error: {
      code,
      message: safeMessage,
      ...(details ? { details } : {}),
    },
    requestId: req.id,
  });
}

module.exports = { errorHandler, notFoundHandler, normalize };
