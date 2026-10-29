/**
 * FraudEvent — one signal raised by the anti-fraud layer.
 *
 * Spec coverage: event type, severity, status, relevant references, timestamps.
 *
 * Privacy rule: this collection correlates behaviour by SALTED HASHES and coarse
 * buckets only. No name, email, phone, address, raw IP or user-agent ever lands
 * here — a fraud record must be safe to read for an analyst who has no business
 * seeing the user's identity documents.
 */
const mongoose = require('mongoose');
const { jsonOptions, objectOptions, blockDelete, withSeedMarker } = require('../utils/schema.js');
const {
  FRAUD_EVENT_TYPES,
  FRAUD_EVENT_TYPE,
  FRAUD_SEVERITIES,
  FRAUD_SEVERITY,
  FRAUD_EVENT_STATUSES,
  FRAUD_EVENT_STATUS,
} = require('../config/constants.js');

const hex = /^[a-f0-9]{16,64}$/;

const ACTIONS = Object.freeze([
  'NONE', // observe only
  'RATE_LIMITED',
  'ENTRY_HELD', // participation kept but not counted until review
  'ACCOUNT_FLAGGED',
  'MANUAL_REVIEW',
]);

const fraudEventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: FRAUD_EVENT_TYPES, required: true, index: true },
    severity: { type: String, enum: FRAUD_SEVERITIES, default: FRAUD_SEVERITY.LOW },
    status: { type: String, enum: FRAUD_EVENT_STATUSES, default: FRAUD_EVENT_STATUS.OPEN },

    // ----- references (what the signal is about) -----------------------------
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    giveawayId: { type: mongoose.Schema.Types.ObjectId, ref: 'Giveaway', default: null },
    participationId: { type: mongoose.Schema.Types.ObjectId, ref: 'GiveawayParticipation', default: null },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'GiveawayEntryTransaction', default: null },
    requestId: { type: String, trim: true },

    // ----- pseudonymous correlation only -------------------------------------
    deviceHash: { type: String, match: [hex, 'deviceHash must be a salted digest.'] },
    sessionHash: { type: String, match: [hex, 'sessionHash must be a salted digest.'] },
    ipHash: { type: String, match: [hex, 'ipHash must be a salted digest.'] },
    country: { type: String, uppercase: true, minlength: 2, maxlength: 2 },
    clientClass: { type: String, trim: true, maxlength: 60 },

    /** The rule that fired and what it measured — numbers, never raw payloads. */
    signal: {
      ruleKey: { type: String, trim: true },
      ruleVersion: { type: String, trim: true, default: 'v1' },
      metric: { type: String, trim: true }, // e.g. 'entries_per_device_per_hour'
      observed: { type: Number },
      threshold: { type: Number },
      windowSeconds: { type: Number, min: 1 },
    },

    actionTaken: { type: String, enum: ACTIONS, default: 'NONE' },
    /** Counters keep repeat signals compact instead of duplicating documents. */
    occurrenceCount: { type: Number, min: 1, default: 1 },
    firstSeenAt: { type: Date },
    lastSeenAt: { type: Date },

    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    /** Outcome text must not restate PII; short codes are enough for audit. */
    resolutionNote: { type: String, trim: true, maxlength: 500 },
    /** Set by the retention policy migration (see applyRetention), not by app code. */
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: jsonOptions(), toObject: objectOptions() },
);

fraudEventSchema.statics.ACTIONS = ACTIONS;

fraudEventSchema.pre('validate', function stampFirstSeen(next) {
  const now = this.lastSeenAt || new Date();
  this.firstSeenAt = this.firstSeenAt || now;
  this.lastSeenAt = now;
  next();
});

/** Confirmed/dismissed are decisions; they are recorded, never silently rewound. */
const TERMINAL = [FRAUD_EVENT_STATUS.CONFIRMED, FRAUD_EVENT_STATUS.DISMISSED];
fraudEventSchema.pre('validate', function validateResolution(next) {
  // A decision needs an author and a time, whether the event is created resolved
  // (imported) or resolved later by an analyst.
  if (TERMINAL.includes(this.status) && (!this.resolvedBy || !this.resolvedAt)) {
    this.invalidate('status', 'A resolved fraud event needs an actor and a resolution timestamp.');
  }
  if (this.isNew || !this.isModified('status')) return next();
  if (TERMINAL.includes(this.$__originalFraudStatus)) {
    this.invalidate('status', `Fraud event already ${this.$__originalFraudStatus}; open a new event to record a changed decision.`);
  }
  next();
});

const captureOriginal = function captureOriginal(doc) {
  doc.$__originalFraudStatus = doc.status;
};
fraudEventSchema.post('init', captureOriginal);
fraudEventSchema.post('save', captureOriginal);

/**
 * Merges a repeat signal instead of spamming a new document (keeps velocity
 * checks readable). Callers pass the hashed identifiers only.
 */
fraudEventSchema.statics.recordOrMerge = async function recordOrMerge(fields) {
  const { type, deviceHash, sessionHash, userId, giveawayId, status } = fields;
  const isOpen = !status || status === FRAUD_EVENT_STATUS.OPEN || status === FRAUD_EVENT_STATUS.UNDER_REVIEW;
  if (isOpen && type) {
    const existing = await this.findOne({
      type,
      status: { $in: [FRAUD_EVENT_STATUS.OPEN, FRAUD_EVENT_STATUS.UNDER_REVIEW] },
      ...(deviceHash ? { deviceHash } : {}),
      ...(sessionHash ? { sessionHash } : {}),
      ...(userId ? { userId } : {}),
      ...(giveawayId ? { giveawayId } : {}),
    });
    if (existing) {
      existing.occurrenceCount += 1;
      existing.lastSeenAt = new Date();
      // Reactivated evidence is no longer scheduled for removal; the retention
      // migration re-stamps it once it goes quiet for `FRAUD_RETENTION_DAYS`.
      existing.expiresAt = null;
      if (typeof fields.signal?.observed === 'number') existing.signal.set(fields.signal);
      if (fields.severity && FRAUD_SEVERITIES.includes(fields.severity)) {
        const order = FRAUD_SEVERITIES;
        if (order.indexOf(fields.severity) > order.indexOf(existing.severity)) existing.severity = fields.severity;
      }
      await existing.save();
      return existing;
    }
  }
  return this.create(fields);
};

/**
 * Retention is a POLICY, so it is applied by the migration runner rather than
 * hard-coded here: `applyRetention(30)` makes MongoDB drop fraud events 30 days
 * after their `expiresAt`. The TTL index is declared on the schema ONLY when
 * `FRAUD_RETENTION_DAYS` is configured, which keeps the schema, the database and
 * `npm run db:migrate:check` in agreement about what the deployment intends.
 */
const RETENTION_DAYS = (() => {
  const n = Number.parseInt(process.env.FRAUD_RETENTION_DAYS || '', 10);
  return Number.isInteger(n) && n > 0 ? n : 0;
})();
fraudEventSchema.statics.RETENTION_DAYS = RETENTION_DAYS;

fraudEventSchema.statics.applyRetention = async function applyRetention(days) {
  if (!Number.isInteger(days) || days < 1) throw new Error('FRAUD_RETENTION_DAYS must be a positive integer.');
  await this.collection.createIndexes([
    { key: { expiresAt: 1 }, name: 'ttl_expiresAt', expireAfterSeconds: 0 },
  ]);
  // Report what the database actually has, not what the call asked for.
  const live = await this.collection.indexes().catch(() => []);
  const indexed = live.some((i) => i.name === 'ttl_expiresAt' && i.expireAfterSeconds === 0);
  // A TTL index over `null` expires nothing, so the policy must also name the
  // moment each row becomes eligible for removal. Rows that already have one are
  // left alone (idempotent), and only this retention field is touched — never the
  // signal itself.
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const res = await this.updateMany(
    { expiresAt: null, $or: [{ lastSeenAt: null }, { lastSeenAt: { $lte: cutoff } }] },
    [{ $set: { expiresAt: { $add: [{ $ifNull: ['$lastSeenAt', '$$NOW'] }, days * 86_400_000] } } }],
  );
  return { days, indexed, stamped: res.modifiedCount };
};

// ---------------------------------------------------------------------------
// Deletion: analysts must not be able to erase evidence. MongoDB's TTL (above)
// is the only lifecycle mechanism; app code never deletes fraud history.
// ---------------------------------------------------------------------------
blockDelete(fraudEventSchema, { label: 'fraud-event' });

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
fraudEventSchema.index({ status: 1, severity: -1, lastSeenAt: -1 });
fraudEventSchema.index({ userId: 1, createdAt: -1 });
fraudEventSchema.index({ giveawayId: 1, type: 1 });
fraudEventSchema.index({ deviceHash: 1, createdAt: -1 });
// Lookup key for the merge path in `recordOrMerge` (hashes only — never identity
// data). Deliberately NOT unique: two distinct signals can legitimately share a
// null device/user scope for the same event, so merging is decided by the code.
fraudEventSchema.index({ type: 1, deviceHash: 1, userId: 1, giveawayId: 1, status: 1 });
// Declared only when the deployment asks for retention, so `syncIndexes`, the
// database and `npm run db:migrate:check` agree. When it is off, applyRetention()
// is the only thing that can create the index.
if (RETENTION_DAYS > 0) {
  fraudEventSchema.index({ expiresAt: 1 }, { name: 'ttl_expiresAt', expireAfterSeconds: 0 });
}

fraudEventSchema.statics.FRAUD_EVENT_TYPE = FRAUD_EVENT_TYPE;

/** Written by the dev seed only; null on every real record. */
withSeedMarker(fraudEventSchema);

module.exports = mongoose.model('FraudEvent', fraudEventSchema);
