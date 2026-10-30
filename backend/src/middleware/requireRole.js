/**
 * requireRole — role-based authorization (deny-by-default).
 *
 * Checks the roles on the authenticated principal (populated by `authenticate`
 * from the VERIFIED token — never from a client-supplied role field). Admin
 * endpoints must be wrapped in requireRole('admin'); anything unauthenticated is
 * rejected first.
 *
 * NOTE: this reads `req.auth.roles`, which is the token claim until
 * `resolveIdentity` has confirmed the roles stored server-side for that account
 * (the plan G1 enrichment, now implemented). Administrative routes therefore run
 * `authenticate -> requireAdmin -> resolveIdentity -> requireAdmin`: the token is
 * denied first (cheap, no I/O), then the store gets the final say.
 */
const { ApiError } = require('../utils/ApiError.js');

function requireRole(...roles) {
  const required = roles.flat();
  return function authorize(req, res, next) {
    if (!req.auth) {
      return next(ApiError.unauthorized('Authentication required.'));
    }
    const owned = req.auth.roles || [];
    if (!required.some((r) => owned.includes(r))) {
      return next(ApiError.forbidden('You do not have permission to perform this action.'));
    }
    return next();
  };
}

const requireAdmin = requireRole('admin');

module.exports = { requireRole, requireAdmin };
