/**
 * ============================================================================
 * VELOOP AUTH ADAPTER — the ONLY place token verification strategy lives.
 * ============================================================================
 * Two modes, selected by config.auth.mode:
 *   • 'jwt'      — verifies real access tokens issued by the VELOOP auth system
 *                  using an operator-provided HMAC secret (JWT_SECRET) or RSA/EC
 *                  public key (JWT_PUBLIC_KEY). This is the production seam. It
 *                  does NOT claim any connection exists — it simply verifies the
 *                  signature/claims of whatever token is presented, using the
 *                  keys you configure. Without keys, it cannot mint or trust
 *                  tokens (validateRuntimeConfig blocks production boot).
 *   • 'dev-mock' — LOCAL/TEST ONLY. Verifies tokens signed with DEV_JWT_SECRET so
 *                  the API and its tests are runnable without the external VELOOP
 *                  issuer. Hard-disabled in production.
 *
 * normalizeClaims() maps whatever claim layout the issuer uses into the stable
 * internal shape { sub, roles, email, name } consumed by the middleware.
 * ========================================================================= */
const jwt = require('jsonwebtoken');
const { config } = require('../config/index.js');
const { ApiError } = require('../utils/ApiError.js');

function assertDevMockAllowed(mode) {
  if (mode === 'dev-mock' && config.isProduction) {
    throw new ApiError(
      500,
      'AUTH_MISCONFIGURED',
      'dev-mock authentication is not permitted in production.',
    );
  }
}

/** Signing/verification key for the active mode. */
function keyForMode(mode) {
  if (mode === 'dev-mock') return config.auth.devSecret;
  // Prefer an asymmetric public key when configured; otherwise HMAC secret.
  return config.auth.jwtPublicKey || config.auth.jwtSecret;
}

function algorithmsForMode(mode) {
  if (mode === 'dev-mock') return ['HS256'];
  return config.auth.algorithms.length ? config.auth.algorithms : ['HS256'];
}

function extractRoles(payload) {
  const raw =
    payload.roles ||
    payload.realm_roles ||
    payload.authorities ||
    (payload.role ? [payload.role] : undefined);
  const list = Array.isArray(raw)
    ? raw.map((r) => String(r).trim()).filter(Boolean)
    : [];
  // Every authenticated principal is at least a 'user'; elevated roles must be
  // explicitly present in the verified token (never implied).
  if (!list.includes('user')) list.unshift('user');
  return list;
}

/** Map a verified JWT payload into the stable internal auth principal. */
function normalizeClaims(payload, mode) {
  const sub = payload.sub || payload.userId || payload.user_id || payload.veoopId || payload.veId;
  if (!sub) {
    throw new ApiError(401, 'INVALID_TOKEN', 'Token is missing a subject identifier.');
  }
  return {
    sub: String(sub),
    roles: extractRoles(payload),
    email: payload.email,
    name: payload.name || payload.preferred_username,
    scope: payload.scope,
    provider: mode,
  };
}

/**
 * Verify an access token and return the normalized principal.
 * Throws ApiError(401) for expired/invalid/missing-subject tokens.
 */
function verifyAccessToken(token) {
  const mode = config.auth.mode;
  assertDevMockAllowed(mode);

  if (!token) {
    throw new ApiError(401, 'LOGIN_REQUIRED', 'Missing access token.');
  }

  const key = keyForMode(mode);
  if (!key) {
    // A real-mode deployment with no key configured cannot verify anything.
    throw new ApiError(
      500,
      'AUTH_MISCONFIGURED',
      'No verification key configured for the active auth mode.',
    );
  }

  const verifyOptions = { algorithms: algorithmsForMode(mode) };
  if (mode === 'jwt') {
    if (config.auth.issuer) verifyOptions.issuer = config.auth.issuer;
    if (config.auth.audience) verifyOptions.audience = config.auth.audience;
  }

  let payload;
  try {
    payload = jwt.verify(token, key, verifyOptions);
  } catch (err) {
    if (err && err.name === 'TokenExpiredError') {
      throw new ApiError(401, 'TOKEN_EXPIRED', 'Access token has expired.');
    }
    throw new ApiError(401, 'INVALID_TOKEN', 'Access token is invalid.');
  }

  return normalizeClaims(payload, mode);
}

/**
 * Sign an access token. Used to mint local dev/test tokens. In 'jwt' mode it
 * signs with the configured HMAC secret so integrators can validate the real
 * verification path; asymmetric signing is the issuer's responsibility.
 */
function signAccessToken(claims = {}, options = {}) {
  const mode = config.auth.mode;
  assertDevMockAllowed(mode);
  const key = keyForMode(mode);
  if (!key) {
    throw new ApiError(500, 'AUTH_MISCONFIGURED', 'No signing key configured.');
  }
  const expiresIn =
    options.expiresIn || (mode === 'dev-mock' ? `${config.auth.devTokenTtlSeconds}s` : '15m');
  return jwt.sign(claims, key, { algorithm: 'HS256', expiresIn, ...options });
}

module.exports = {
  verifyAccessToken,
  signAccessToken,
  normalizeClaims,
  extractRoles,
  isDevMock: () => config.auth.mode === 'dev-mock',
};
