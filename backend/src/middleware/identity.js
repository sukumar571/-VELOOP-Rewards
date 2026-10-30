/**
 * ============================================================================
 * IDENTITY — turns a VERIFIED token subject into an application identity.
 * ============================================================================
 * `authenticate` proves the token; this proves the ACCOUNT. Two jobs:
 *
 *  1. Resolve the internal `userId` from the token's `sub` via `User.resolve()`
 *     and put it on `req.auth.userId`. Every service derives identity from THAT
 *     (never from a request body), which is what makes "userId comes from the
 *     verified authentication context" structurally true rather than a convention.
 *  2. Replace the token's role claim with the roles stored server-side, so a
 *     token minted yesterday with an admin role cannot outlive today's revocation.
 *     This closes the note in requireRole.js: admin is now CONFIRMED IN THE STORE.
 *  3. Refuse accounts that are not ACTIVE (403 ACCOUNT_NOT_ACTIVE).
 *
 * Honest degradation: when MongoDB is unreachable the store cannot be consulted.
 * Rather than failing every authenticated request with a confusing 500, the
 * middleware keeps the VERIFIED token roles, sets `rolesSource: 'token'`, marks
 * `userId: null` and logs a warning. Anything that actually needs the store then
 * fails with the normal 503 — nothing silently gains or loses privileges, and
 * `rolesSource` makes the difference observable in a response/log for operators.
 * ========================================================================= */
const User = require('../models/user.model.js');
const { isConnected } = require('../config/db.js');
const { logger } = require('../config/logger.js');
const { ApiError } = require('../utils/ApiError.js');
const { domain } = require('../utils/domainErrors.js');
const { USER_STATUS, ROLE } = require('../config/constants.js');

const APP_ROLES = Object.values(ROLE);

function fromToken(req) {
  req.auth.rolesSource = 'token';
  req.auth.userId = null;
  req.auth.veloopId = req.auth.sub;
  req.auth.isAdmin = (req.auth.roles || []).includes(ROLE.ADMIN);
}

const resolveIdentity = function resolveIdentity(req, res, next) {
  // Optional-auth routes reach here without credentials: nothing to resolve, and
  // it is NOT an error (the route itself decides whether a principal is required).
  if (!req.auth) return next();

  if (!isConnected()) {
    fromToken(req);
    logger.warn({ requestId: req.id, sub: req.auth.sub }, 'Identity resolved from token claims only (database offline)');
    return next();
  }

  // Only the roles this application actually models may be copied into the cache
  // row: an issuer may carry unrelated claims (scope names, other-app roles) and
  // passing them through would fail schema validation on every single request.
  const seedRoles = (req.auth.roles || []).filter((r) => APP_ROLES.includes(r));

  User.resolve(req.auth.sub, {
    // First sight: seed the cache row from verified claims only.
    email: req.auth.email || undefined,
    displayName: req.auth.name || undefined,
    roles: seedRoles.length ? seedRoles : [ROLE.USER],
  })
    .then((user) => {
      if (!user) return next(ApiError.unavailable('Identity store unavailable.'));
      if (user.status !== USER_STATUS.ACTIVE) {
        return next(domain('ACCOUNT_NOT_ACTIVE', undefined, { status: user.status }));
      }
      req.auth.userId = String(user._id);
      req.auth.veloopId = user.veloopId;
      req.auth.roles = user.roles || [];
      req.auth.accountStatus = user.status;
      req.auth.publicAlias = user.publicAlias || null;
      req.auth.kycStatus = user.kyc?.status || 'UNKNOWN';
      req.auth.rolesSource = 'store';
      req.auth.isAdmin = req.auth.roles.includes(ROLE.ADMIN);
      return next();
    })
    .catch((err) => {
      // A broken identity lookup must never fall through as "anonymous admin".
      if (err && err.name === 'ValidationError') return next(domain('IDENTITY_UNRESOLVED'));
      return next(err);
    });
};

/**
 * Guard for the WRITE paths: an identity is only usable for ownership-scoped
 * operations once it resolved to a real account row. When the database is down
 * this cannot be true, so the request stops here with the same honest 503 every
 * other data route gives — instead of writing an orphaned row with a null user.
 */
function requireResolvedIdentity(req, res, next) {
  if (!req.auth) return next(ApiError.unauthorized('A valid access token is required.'));
  if (!req.auth.userId) return next(domain('DATABASE_UNAVAILABLE'));
  return next();
}

module.exports = { resolveIdentity, requireResolvedIdentity };
