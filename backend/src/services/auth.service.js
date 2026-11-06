/**
 * ============================================================================
 * AUTH SERVICE — creates and verifies LOCAL accounts (email + password).
 * ============================================================================
 * The application has always been a *token verifier* for the external VELOOP
 * identity system (see `integrations/veloopAuth.js`). This service adds a
 * second, clearly-isolated credential source for accounts that signed up here
 * because no VELOOP issuer exists yet in the deployment:
 *
 *   • Signup hashes the password with bcrypt, mints a `User` row with
 *     `authProvider: 'local'` and a deterministic `veloopId = local:<email>`,
 *     then signs a bearer JWT with the same adapter the app uses for its
 *     dev-mock / jwt modes. Downstream identity resolution
 *     (`resolve(sub)` → `User.resolve`) therefore finds the SAME row without a
 *     single special case anywhere else in the codebase.
 *   • Login loads the row WITH the hash, does a constant-time bcrypt.compare,
 *     refreshes `lastSeenAt`, re-signs a JWT and returns the public user.
 *   • On an unknown email we still run bcrypt.compare against a module-level
 *     dummy hash so the wall-clock time of "user exists / user does not exist"
 *     stays indistinguishable to the caller. The response is the SAME
 *     `INVALID_CREDENTIALS` in both branches — no enumeration.
 *   • External (`authProvider:'veloop'`) rows are NEVER touched by this
 *     service: `findLocalByEmail` scopes the query, and login rejects a null
 *     row before it can hit a VELOOP-cache document. Passwords for VELOOP
 *     accounts live only in VELOOP.
 *
 * All rows created here go to the `users` collection of the MongoDB pointed to
 * by `MONGODB_URI` — the Atlas cluster configured in backend/.env — and nowhere
 * else. The dev seed's mock path is untouched.
 * ========================================================================= */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/user.model.js');
const { signAccessToken } = require('../integrations/veloopAuth.js');
const { logger } = require('../config/logger.js');
const { domain } = require('../utils/domainErrors.js');
const { ApiError } = require('../utils/ApiError.js');
const { ROLE, USER_STATUS } = require('../config/constants.js');

/**
 * Cost factor 10 keeps a hash under ~100 ms on a modern CPU (OWASP minimum)
 * while remaining bcrypt-compatible. The same constant lives in the model so
 * `user.setPassword()` (used in tests/scripts) and this service cannot drift.
 */
const BCRYPT_ROUNDS = 10;

// Computed once at module load. Compared against when the email is unknown, so
// the response time of that branch matches the "wrong password" branch and the
// endpoint cannot be used as an account oracle.
const DUMMY_HASH = bcrypt.hashSync('veloop-timing-equaliser-not-a-real-password', BCRYPT_ROUNDS);

/** What the API returns to the caller — never includes passwordHash. */
function publicPrincipal(user) {
  return {
    id: String(user._id),
    veloopId: user.veloopId,
    email: user.email || null,
    name: user.displayName || user.publicAlias || 'Member',
    roles: user.roles || [ROLE.USER],
    authProvider: user.authProvider,
    status: user.status,
  };
}

/**
 * Sign an access token for a freshly authenticated local account. TTL follows
 * the deployment's mode so a dev-mock session lives as long as the demo
 * operator expects and a `jwt` mode session matches the production policy.
 */
function mintToken(user) {
  const claims = {
    sub: user.veloopId,
    email: user.email,
    name: user.displayName,
    roles: user.roles || [ROLE.USER],
  };
  // In dev-mock, signAccessToken defaults to `devTokenTtlSeconds`; in jwt mode it
  // defaults to '15m'. We let it pick per-mode so a misconfigured JWT_SECRET or
  // missing DEV_JWT_SECRET raises the same AUTH_MISCONFIGURED as elsewhere.
  return signAccessToken(claims);
}

async function signup({ name, email, password } = {}) {
  if (!email || !password) {
    throw ApiError.badRequest('Email and password are required.');
  }
  const veloopId = User.localVeloopId(email);

  // Application-level pre-check gives a nicer error than catching E11000. The
  // unique index on veloopId is still the ultimate arbiter in a race, so the
  // try/catch below is the honest path.
  const clash = await User.findOne({ veloopId }).lean();
  if (clash) throw domain('EMAIL_TAKEN');

  const passwordHash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);
  // Cosmetic alias; not unique, not authoritative for masking winners.
  const publicAlias = `Member #${crypto.randomInt(1000, 9999)}`;

  let user;
  try {
    user = await User.create({
      veloopId,
      email: String(email).trim().toLowerCase(),
      displayName: String(name).trim(),
      publicAlias,
      authProvider: 'local',
      roles: [ROLE.USER],
      status: USER_STATUS.ACTIVE,
      passwordHash,
      passwordSetAt: new Date(),
      lastSeenAt: new Date(),
    });
  } catch (err) {
    if (err && err.code === 11000) throw domain('EMAIL_TAKEN');
    if (err && err.name === 'ValidationError') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Registration failed.', {
        fields: Object.keys(err.errors || {}),
      });
    }
    logger.error({ err }, 'Unexpected failure while creating a local account');
    throw err;
  }

  // `passwordHash` was written directly, so it lives on the in-memory doc; the
  // toJSON privatePaths strip is defense-in-depth, but nulling it here means a
  // future refactor cannot accidentally serialize the hash through some other
  // code path.
  user.passwordHash = undefined;
  return { user: publicPrincipal(user), token: mintToken(user) };
}

async function login({ email, password } = {}) {
  if (!email || !password) throw domain('INVALID_CREDENTIALS');

  const user = await User.findLocalByEmail(email);

  if (!user) {
    // Burn the same bcrypt budget the found-user branch would spend, then
    // respond with the same code the wrong-password branch uses.
    await bcrypt.compare(String(password), DUMMY_HASH);
    throw domain('INVALID_CREDENTIALS');
  }

  const ok = await bcrypt.compare(String(password), user.passwordHash || '');
  if (!ok) throw domain('INVALID_CREDENTIALS');

  if (user.status !== USER_STATUS.ACTIVE) {
    throw domain('ACCOUNT_NOT_ACTIVE', undefined, { status: user.status });
  }

  // Only touch lastSeenAt. Do NOT null `passwordHash` on the document here:
  // assigning `undefined` and calling `save()` makes Mongoose issue a `$unset`,
  // which DELETES the stored hash from Atlas — the next login would then compare
  // against an empty string and fail forever. The hash never leaves this function
  // anyway, because `publicPrincipal()` builds a fresh object that omits it.
  user.lastSeenAt = new Date();
  await user.save();

  return { user: publicPrincipal(user), token: mintToken(user) };
}

module.exports = { signup, login, publicPrincipal };
