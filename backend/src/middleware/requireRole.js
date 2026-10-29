/**
 * requireRole — role-based authorization (deny-by-default).
 *
 * Checks the roles on the authenticated principal (populated by `authenticate`
 * from the VERIFIED token — never from a client-supplied role field). Admin
 * endpoints must be wrapped in requireRole('admin'); anything unauthenticated is
 * rejected first.
 *
 * NOTE (plan G1): when the User/roles collection is connected, admin checks
 * SHOULD additionally confirm the role server-side rather than trusting the token
 * claim alone. That enrichment is intentionally behind the auth adapter / a
 * service seam and is not stubbed here, because the identity provider is not yet
 * connected in this workspace.
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
