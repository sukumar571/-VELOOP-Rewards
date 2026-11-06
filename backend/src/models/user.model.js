/**
 * User — the application's identity cache. It has TWO sources:
 *
 *   • `authProvider: 'veloop'` (default) — the external VELOOP identity system is
 *     authoritative for credentials; this row only caches the claims we saw on
 *     the first verified bearer token (see `User.resolve(sub)`). NO password
 *     ever lives on such a row.
 *   • `authProvider: 'local'` — an account that signed up through
 *     `POST /api/v1/auth/signup`. The password is stored here as a bcrypt hash
 *     (`passwordHash`, `select:false`, privatePath). We synthesise
 *     `veloopId = local:<lowercased-email>` so the existing unique index on
 *     `veloopId` transparently enforces email-uniqueness AND lets the identity
 *     middleware (`resolve(sub)`) find the same row without any special case.
 *
 * Identity resolution rule: every other collection references THIS document by
 * `_id`, while the (external or synthesised) subject lives in `veloopId`. A JWT
 * `sub` becomes an internal userId through `User.resolve(veloopId)` and the rest
 * of the model graph never has to care which provider minted the credential.
 */
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { jsonOptions, objectOptions, blockDelete, withSeedMarker } = require('../utils/schema.js');
const { USER_STATUSES, USER_STATUS, ROLE } = require('../config/constants.js');

/** bcrypt cost — 10 is OWASP's minimum and the target < 250 ms on server CPUs. */
const BCRYPT_ROUNDS = 10;

const AUTH_PROVIDER = Object.freeze({ VELOOP: 'veloop', LOCAL: 'local' });
const AUTH_PROVIDERS = Object.freeze(Object.values(AUTH_PROVIDER));

const userSchema = new mongoose.Schema(
  {
    veloopId: { type: String, required: true, unique: true, index: true, trim: true },
    email: { type: String, trim: true, lowercase: true, index: true },
    displayName: { type: String, trim: true, maxlength: 200 },
    /** Stable public alias used to mask winners ("Member #4821"). */
    publicAlias: { type: String, trim: true, maxlength: 60 },
    /** Which system owns the credential: VELOOP (cache only) or this app (bcrypt). */
    authProvider: {
      type: String,
      enum: AUTH_PROVIDERS,
      default: AUTH_PROVIDER.VELOOP,
      index: true,
    },
    // Only populated for `authProvider: 'local'`. `select:false` keeps it off
    // every default read so a controller cannot leak it by forgetting to
    // project; the auth service explicitly opts in with `.select('+passwordHash')`.
    passwordHash: { type: String, select: false },
    passwordSetAt: { type: Date },
    roles: {
      type: [String],
      enum: Object.values(ROLE),
      default: [ROLE.USER],
      // Roles are app-level authorizations; 'admin' must additionally be
      // confirmed server-side (see requireRole note) — never self-assigned.
      validate: [(arr) => Array.isArray(arr) && arr.length > 0, 'A user needs at least one role.'],
    },
    status: { type: String, enum: USER_STATUSES, default: USER_STATUS.ACTIVE, index: true },
    // KYC/geo eligibility is [PDF]; captured as opaque flags, not enforced here.
    kyc: {
      status: { type: String, enum: ['UNKNOWN', 'PENDING', 'VERIFIED', 'REJECTED'], default: 'UNKNOWN' },
      verifiedAt: { type: Date },
    },
    lastSeenAt: { type: Date },
  },
  {
    timestamps: true,
    // email + kyc are PII and passwordHash is a credential — never leave through
    // a default serialization. The auth service explicitly clears `passwordHash`
    // before returning the doc; the privatePaths list is defense-in-depth.
    toJSON: jsonOptions({ privatePaths: ['email', 'kyc', 'passwordHash', 'passwordSetAt'] }),
    toObject: objectOptions({ privatePaths: ['passwordHash', 'passwordSetAt'] }),
  },
);

/** Internal id for an external identity (creates the cache row on first sight). */
userSchema.statics.resolve = function resolve(veloopId, defaults = {}) {
  return this.findOneAndUpdate(
    { veloopId: String(veloopId) },
    { $setOnInsert: { veloopId: String(veloopId), ...defaults }, $set: { lastSeenAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

/**
 * Deterministic `veloopId` for a locally-registered account. Kept lowercase +
 * trimmed so `a@B.com` and `A@b.COM` collide on the unique index exactly once.
 */
userSchema.statics.localVeloopId = function localVeloopId(email) {
  return `local:${String(email || '').trim().toLowerCase()}`;
};

/**
 * Fetch a local account by email WITH the password hash so a login attempt can
 * compare it. Deliberately returns null on external accounts (authProvider
 * 'veloop') to keep the credential path from ever touching VELOOP-owned rows.
 */
userSchema.statics.findLocalByEmail = function findLocalByEmail(email) {
  return this.findOne({
    veloopId: this.localVeloopId(email),
    authProvider: AUTH_PROVIDER.LOCAL,
  }).select('+passwordHash +passwordSetAt');
};

/** Hash + stage a new password on the document. Caller must `.save()`. */
userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(String(plain), BCRYPT_ROUNDS);
  this.passwordSetAt = new Date();
  return this;
};

/** Constant-time bcrypt verify against the loaded `passwordHash` (if any). */
userSchema.methods.verifyPassword = function verifyPassword(plain) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(String(plain || ''), this.passwordHash);
};

userSchema.methods.isAdmin = function isAdmin() {
  return (this.roles || []).includes(ROLE.ADMIN);
};

/**
 * Deletion policy: every participation, winner, claim and audit row references
 * this document, so a hard delete would silently orphan the history. Account
 * erasure/anonymisation is a separate, explicitly designed policy (never a
 * `deleteOne()` in a feature branch) — here the row is retained.
 */
blockDelete(userSchema, { label: 'user' });

/** Written by the dev seed only; null on every real record. */
withSeedMarker(userSchema);

module.exports = mongoose.model('User', userSchema);
