/**
 * ApiError — an operational error with an HTTP status and a stable machine code.
 * The centralized error handler turns these into the RFC-7807-style response
 * body { code, message, details } without leaking internals in production.
 */
class ApiError extends Error {
  constructor(statusCode, code, message, details = undefined) {
    super(message || code || 'Error');
    this.name = 'ApiError';
    this.statusCode = statusCode || 500;
    this.code = code || 'INTERNAL_ERROR';
    this.details = details;
    // Errors we raise deliberately are "operational"; anything else is a bug.
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', details) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }
  // LOGIN_REQUIRED is the client-facing contract for "no usable credentials on
  // this request" (the spec names this code explicitly); it replaces the earlier
  // generic UNAUTHENTICATED label.
  static unauthorized(message = 'A valid access token is required.', details) {
    return new ApiError(401, 'LOGIN_REQUIRED', message, details);
  }
  static forbidden(message = 'You do not have access to this resource', details) {
    return new ApiError(403, 'FORBIDDEN', message, details);
  }
  static notFound(message = 'Resource not found', details) {
    return new ApiError(404, 'NOT_FOUND', message, details);
  }
  static conflict(message = 'Conflict', details) {
    return new ApiError(409, 'CONFLICT', message, details);
  }
  static tooLarge(message = 'Payload too large', details) {
    return new ApiError(413, 'PAYLOAD_TOO_LARGE', message, details);
  }
  static tooManyRequests(message = 'Too many requests', details) {
    return new ApiError(429, 'RATE_LIMITED', message, details);
  }
  static unavailable(message = 'Service temporarily unavailable', details) {
    return new ApiError(503, 'SERVICE_UNAVAILABLE', message, details);
  }
  static internal(message = 'Internal server error', details) {
    return new ApiError(500, 'INTERNAL_ERROR', message, details);
  }
}

module.exports = { ApiError };
