/**
 * WalletReference — a LOCAL CACHE of where a user's VELOOP wallet stands.
 *
 * Why a reference and not a wallet: the spec's wallet lives in the existing
 * VELOOP system, so this app must never become a second source of truth for
 * balances. This collection stores what the wallet adapter last observed, so a
 * read path (or a support agent) can say "the provider reported X at time T".
 *
 * Consequences baked into the schema:
 *  - An entry is only ever accepted from the adapter (`recordSnapshot`) or a
 *    clearly tagged fixture (`SEED_FIXTURE`), never from a client.
 *  - In production a snapshot tagged SEED_FIXTURE is refused outright.
 *  - `balance` is always paired with `observedAt` + `source`; code must check
 *    `isFresh()` before relying on it, and re-read the API when it is not.
 */
const mongoose = require('mongoose');
const { jsonOptions, objectOptions, withSeedMarker } = require('../utils/schema.js');
const { CURRENCIES, WALLET_SOURCE } = require('../config/constants.js');

const walletReferenceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    currency: { type: String, enum: CURRENCIES, required: true },
    /** Opaque account identifier supplied by the wallet provider. */
    externalWalletId: { type: String, trim: true, default: null },

    /** Last observed balance. null = we have never successfully read it. */
    balance: { type: Number, min: 0, default: null },
    observedAt: { type: Date, default: null },
    source: { type: String, enum: Object.values(WALLET_SOURCE), default: WALLET_SOURCE.VELOOP_API },

    /** Set when the provider stopped answering, so the UI can say "stale". */
    stale: { type: Boolean, default: false },
    lastErrorCode: { type: String, trim: true, maxlength: 60 },
  },
  { timestamps: true, toJSON: jsonOptions(), toObject: objectOptions() },
);

/** One row per (user, currency). */
walletReferenceSchema.index({ userId: 1, currency: 1 }, { unique: true });
// staleness sweep
walletReferenceSchema.index({ observedAt: 1 });

walletReferenceSchema.methods.isFresh = function isFresh(maxAgeSeconds, now = new Date()) {
  if (!this.observedAt || this.stale) return false;
  const ageMs = now.getTime() - new Date(this.observedAt).getTime();
  return ageMs <= maxAgeSeconds * 1000;
};

/**
 * Stores a snapshot returned by the wallet adapter. Production refuses fixture
 * data, so a seeded balance can never be mistaken for a real one after a bad
 * deploy.
 */
walletReferenceSchema.statics.recordSnapshot = function recordSnapshot(
  { userId, currency, balance, externalWalletId, observedAt, source },
  { isProduction = false } = {},
) {
  if (isProduction && source === WALLET_SOURCE.SEED_FIXTURE) {
    throw new Error('WALLET_FIXTURE_IN_PRODUCTION: seeded balances are never authoritative.');
  }
  return this.findOneAndUpdate(
    { userId, currency },
    {
      $set: {
        balance: typeof balance === 'number' ? balance : null,
        externalWalletId: externalWalletId || null,
        observedAt: observedAt || new Date(),
        source,
        stale: false,
        lastErrorCode: null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

/** Marks a snapshot unusable after a provider failure (code only, no body). */
walletReferenceSchema.statics.markStale = function markStale(userId, currency, errorCode) {
  return this.updateOne(
    { userId, currency },
    { $set: { stale: true, lastErrorCode: String(errorCode || 'UNKNOWN').slice(0, 60) } },
  );
};

/** Written by the dev seed only; null on every real record. */
withSeedMarker(walletReferenceSchema);

module.exports = mongoose.model('WalletReference', walletReferenceSchema);
