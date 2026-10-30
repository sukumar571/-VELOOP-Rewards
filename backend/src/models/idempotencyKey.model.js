/**
 * ============================================================================
 * IDEMPOTENCY KEY — the deduplication record for retried paid joins.
 * ============================================================================
 * A client that loses a response (network blip, 5xx) retries with the SAME
 * `Idempotency-Key`. This collection is the authority for "I have already handled
 * that request": the row is created INSIDE the join transaction, so a concurrent
 * retry collides on the unique (userId, key) index instead of double-charging.
 *
 * The stored `requestHash` is a canonical fingerprint of WHAT the key was used for
 * (giveaway, prize, currency, entry count). A retry that carries the same key but a
 * different fingerprint is a genuine misuse (keys must be unique per request), so it
 * is refused with IDEMPOTENCY_KEY_CONFLICT rather than silently replaying the wrong
 * result. `responseSnapshot` holds ONLY the caller's own outcome — never another
 * user's data and never anything secret.
 * ========================================================================= */
const mongoose = require('mongoose');
const crypto = require('crypto');
const { jsonOptions, objectOptions, immutableOnce, withSeedMarker } = require('../utils/schema.js');

const STATUS = Object.freeze({ IN_PROGRESS: 'IN_PROGRESS', COMPLETE: 'COMPLETE', FAILED: 'FAILED' });

/**
 * Canonical, order-stable fingerprint of the operation a key refers to. DB-free so
 * it can be unit-tested without a connection.
 */
function computeRequestHash({ giveawayId, prizeId = null, currency, entries = 1 }) {
  const canonical = JSON.stringify({
    giveawayId: String(giveawayId),
    prizeId: prizeId ? String(prizeId) : null,
    currency: currency || null,
    entries: Number(entries),
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Pure decision for an existing row + the incoming fingerprint. DB-free and unit
 * tested. Returns one of NEW | REPLAY | IN_PROGRESS | CONFLICT.
 */
function classify(existing, requestHash) {
  if (!existing) return 'NEW';
  if (existing.requestHash !== requestHash) return 'CONFLICT';
  if (existing.status === STATUS.COMPLETE) return 'REPLAY';
  if (existing.status === STATUS.IN_PROGRESS) return 'IN_PROGRESS';
  return 'NEW'; // a FAILED prior attempt may be retried for real
}

const idempotencyKeySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    key: { type: String, required: true, trim: true, maxlength: 200 },
    requestHash: { type: String, required: true },
    status: { type: String, enum: Object.values(STATUS), default: STATUS.IN_PROGRESS },
    participationId: { type: mongoose.Schema.Types.ObjectId, ref: 'GiveawayParticipation', default: null },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'GiveawayEntryTransaction', default: null },
    /** The caller's own result, replayed verbatim on a retry. Scrubbed by the service. */
    responseSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: true }, toJSON: jsonOptions(), toObject: objectOptions() },
);

/** THE dedup lock: one row per (user, key); a concurrent retry collides here. */
idempotencyKeySchema.index({ userId: 1, key: 1 }, { unique: true });
// Housekeeping: expire old completed keys (TTL is an ops concern; index only).
idempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

/** Once a key is resolved, its identity (who/what it pins) is frozen. */
immutableOnce(idempotencyKeySchema, {
  paths: ['userId', 'key', 'requestHash'],
  isTerminal: (doc) => doc.status === STATUS.COMPLETE,
  label: 'idempotency key',
});

idempotencyKeySchema.statics.STATUS = STATUS;
idempotencyKeySchema.statics.computeRequestHash = computeRequestHash;
idempotencyKeySchema.statics.classify = classify;

/** Written by the dev seed only; null on every real record. */
withSeedMarker(idempotencyKeySchema);

module.exports = mongoose.model('IdempotencyKey', idempotencyKeySchema);
