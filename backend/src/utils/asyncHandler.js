/**
 * asyncHandler — wraps an async Express handler so any rejected promise is
 * forwarded to the centralized error handler via next(err). Removes the need
 * for try/catch boilerplate in every controller.
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
