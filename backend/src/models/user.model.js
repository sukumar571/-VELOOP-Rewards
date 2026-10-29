/**
 * User — a local cache of the external VELOOP identity (plan E1).
 * NO passwords live here: authentication is delegated to the VELOOP issuer via
 * the auth adapter. This document only links a veloopId to app-side roles/status.
 *
 * Identity resolution rule: every other collection references THIS document by
 * `_id`, while the external issuer's opaque subject lives in `veloopId`. So a
 * JWT `sub` becomes an internal userId through `User.resolve(veloopId)` and the
 * rest of the model graph never has to care what format VELOOP uses.
 */
const mongoose = require('mongoose');
const { jsonOptions, objectOptions, blockDelete, withSeedMarker } = require('../utils/schema.js');
const { USER_STATUSES, USER_STATUS, ROLE } = require('../config/constants.js');

const userSchema = new mongoose.Schema(
  {
    veloopId: { type: String, required: true, unique: true, index: true, trim: true },
    email: { type: String, trim: true, lowercase: true, index: true },
    displayName: { type: String, trim: true, maxlength: 200 },
    /** Stable public alias used to mask winners ("Member #4821"). */
    publicAlias: { type: String, trim: true, maxlength: 60 },
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
    // email + kyc are PII and never leave through a default serialization.
    toJSON: jsonOptions({ privatePaths: ['email', 'kyc'] }),
    toObject: objectOptions(),
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
