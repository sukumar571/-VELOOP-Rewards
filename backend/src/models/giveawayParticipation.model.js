/**
 * GiveawayParticipation — the ONE record that says "this user took part in this
 * event". Extra paid entries are recorded as additional ENTRY TRANSACTIONS against
 * this row (`entryCount`), never as extra participation rows.
 *
 * Spec coverage: userId, giveawayId, prizeId where applicable, entryCurrency,
 * entryAmount, privacy-conscious device/session reference, status, joinedAt,
 * transactionId.
 *
 * The one-participation-per-user-per-event rule is enforced IN THE DATABASE by a
 * unique index on (userId, giveawayId) — see the index block below — so it holds
 * even under a concurrent double-submit. The index is scoped per giveaway, so a
 * new giveaway always accepts new participation records.
 */
const mongoose = require('mongoose');
const { jsonOptions, objectOptions, blockDelete, immutableOnce, withSeedMarker } = require('../utils/schema.js');
const {
  PARTICIPATION_STATUSES,
  PARTICIPATION_STATUS,
  CURRENCIES,
} = require('../config/constants.js');

/**
 * Privacy-conscious device/session reference: salted hashes and coarse signals
 * only. Raw user-agents, IP addresses and device identifiers are NEVER stored.
 */
const deviceRefSchema = new mongoose.Schema(
  {
    deviceHash: { type: String, match: [/^[a-f0-9]{16,64}$/, 'deviceHash must be a salted hex digest.'] },
    sessionHash: { type: String, match: [/^[a-f0-9]{16,64}$/, 'sessionHash must be a salted hex digest.'] },
    ipHash: { type: String, match: [/^[a-f0-9]{16,64}$/, 'ipHash must be a salted hex digest.'] },
    country: { type: String, uppercase: true, minlength: 2, maxlength: 2 },
    /** Coarse bucket ('desktop-chrome'), not the full UA string. */
    clientClass: { type: String, trim: true, maxlength: 60 },
  },
  { _id: false },
);

const participationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    giveawayId: { type: mongoose.Schema.Types.ObjectId, ref: 'Giveaway', required: true },
    /** Only set when the event draws per prize tier. */
    prizeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prize', default: null },

    entryCurrency: { type: String, enum: CURRENCIES, required: true },
    /** What the participant was actually charged for this participation (0 = free entry). */
    entryAmount: { type: Number, required: true, min: 0 },

    deviceRef: { type: deviceRefSchema, default: () => ({}) },

    status: { type: String, enum: PARTICIPATION_STATUSES, default: PARTICIPATION_STATUS.PENDING, index: true },
    joinedAt: { type: Date, default: () => new Date() },

    /** Primary ledger row that paid for this participation. */
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'GiveawayEntryTransaction', default: null },
    /** All ledger rows related to this participation (extra entries, reversals). */
    transactionIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'GiveawayEntryTransaction' }], default: [] },

    /** Entries held by this participant (1 free + any paid extras). */
    entryCount: { type: Number, min: 1, default: 1 },
    /** Snapshot of the rules the participant agreed to — history stays truthful
     *  even after the giveaway edits its rules. */
    rulesVersion: { type: String, trim: true },
    statusHistory: {
      type: [
        { from: String, to: String, at: Date, reason: String, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } },
      ],
      default: [],
    },
    voidReason: { type: String, trim: true, maxlength: 500 },
  },
  {
    timestamps: true,
    toJSON: jsonOptions({ privatePaths: ['deviceRef'] }),
    toObject: objectOptions(),
  },
);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * The persisted status is remembered on load (non-enumerable symbol, never saved)
 * so status rules compare against the database value, not the incoming edit.
 */
const ORIGINAL_STATUS = Symbol('veloop.participation.originalStatus');
const rememberStatus = function rememberStatus(doc) {
  Object.defineProperty(doc, ORIGINAL_STATUS, {
    value: doc.status,
    enumerable: false,
    configurable: true,
    writable: true,
  });
};
participationSchema.post('init', rememberStatus);
participationSchema.post('save', rememberStatus);

/** Terminal states are final: a voided/disqualified row cannot be revived. */
const TERMINAL_STATUSES = [
  PARTICIPATION_STATUS.VOIDED_FRAUD,
  PARTICIPATION_STATUS.DISQUALIFIED,
];
participationSchema.pre('validate', function validateTerminal(next) {
  if (this.isNew || !this.isModified('status')) return next();
  const from = this[ORIGINAL_STATUS];
  if (TERMINAL_STATUSES.includes(from)) {
    this.invalidate('status', `Participation is already ${from}; a terminal status cannot change.`);
  }
  next();
});

participationSchema.pre('save', function trackStatusHistory(next) {
  // A transition log only: the row's creation state is recorded by `joinedAt`.
  if (this.isNew || !this.isModified('status')) return next();
  const at = new Date();
  const from = this[ORIGINAL_STATUS];
  this.statusHistory = this.statusHistory || [];
  this.statusHistory.push({ from, to: this.status, at, reason: this.voidReason });
  if (this.statusHistory.length > 25) this.statusHistory = this.statusHistory.slice(-25);
  next();
});

/**
 * Pure guard for the write path: a prizeId is only valid if it belongs to the
 * same giveaway. DB-free so it can be unit-tested without MongoDB.
 */
participationSchema.statics.assertPrizeInGiveaway = function assertPrizeInGiveaway(giveawayId, prize) {
  if (!prize) return true;
  if (String(prize.giveawayId) !== String(giveawayId)) {
    const err = new Error('PARTICIPATION_SCOPE: prize does not belong to this giveaway.');
    err.code = 'PARTICIPATION_SCOPE';
    throw err;
  }
  return true;
};

participationSchema.statics.TERMINAL_STATUSES = Object.freeze(TERMINAL_STATUSES);

// ---------------------------------------------------------------------------
// Immutability + deletion policy
// ---------------------------------------------------------------------------
// Once a ledger row is attached, the identity of the participation is frozen.
immutableOnce(participationSchema, {
  paths: ['userId', 'giveawayId', 'prizeId', 'joinedAt', 'entryCurrency'],
  isTerminal: (doc) => Boolean(doc.transactionId) || doc.status === PARTICIPATION_STATUS.CONFIRMED,
  label: 'participation',
});

blockDelete(participationSchema, {
  label: 'participation',
  // Only a never-charged, still-pending row may be removed (failed submit cleanup).
  unless: (doc) => doc.status === PARTICIPATION_STATUS.PENDING && !doc.transactionId,
});

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
/** THE business invariant: one participation per user per event. */
participationSchema.index({ userId: 1, giveawayId: 1 }, { unique: true });
// Draw / leaderboard queries.
participationSchema.index({ giveawayId: 1, status: 1 });
// "My entries" list, newest first.
participationSchema.index({ userId: 1, joinedAt: -1 });
// Fraud velocity: how many accounts entered this event from one device.
participationSchema.index({ 'deviceRef.deviceHash': 1, giveawayId: 1 });
participationSchema.index({ transactionId: 1 });

/** Written by the dev seed only; null on every real record. */
withSeedMarker(participationSchema);

module.exports = mongoose.model('GiveawayParticipation', participationSchema);
