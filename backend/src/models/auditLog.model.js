/**
 * AuditLog — append-only trail of every state change (spec: audit log).
 *
 * Rules baked in here:
 *  - Records are never updated or deleted by application code (hooks refuse it).
 *  - Snapshots pass through a field scrubber, so a caller that naively forwards
 *    a whole document cannot leak passwords, tokens, fulfilment PII or auth
 *    headers into the audit trail.
 *  - Only `createdAt` exists (no `updatedAt`) — an audit entry is immutable.
 */
const mongoose = require('mongoose');
const { blockDelete, withSeedMarker } = require('../utils/schema.js');

/** Keys that are sensitive by exact name (short codes, so no substring noise). */
const SENSITIVE_EXACT = new Set([
  'pin',
  'otp',
  'cvv',
  'ssn',
  'iban',
  'kyc',
  'email',
  'phone',
  'password',
  'secret',
  'token',
]);

/** Substrings that mark a longer key as sensitive; matched case-insensitively. */
const SENSITIVE_KEY_PARTS = [
  'password',
  'passcode',
  'secret',
  'token',
  'authorization',
  'cookie',
  'apikey',
  'api_key',
  'otp',
  'cvv',
  'cardnumber',
  'card_number',
  'iban',
  'ssn',
  'docnumber',
  'doc_number',
  'passport',
  'national_id',
  'nationalid',
  'email',
  'phone',
  'address',
  'postal',
  'fulfillment',
  'devicehash',
  'iphash',
  'sessionhash',
];

const MAX_DEPTH = 4;
const MAX_KEYS = 40;

function isSensitiveKey(key) {
  const k = String(key).toLowerCase();
  return SENSITIVE_EXACT.has(k) || SENSITIVE_KEY_PARTS.some((part) => k.includes(part));
}

/**
 * Deep-copies a diff-like value, dropping sensitive keys, Dates kept, everything
 * else truncated. Returns undefined for an empty result so the document stays small.
 */
function scrub(value, depth = 0) {
  if (value === null || value === undefined) return undefined;
  if (depth >= MAX_DEPTH) return '[TRUNCATED]';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, MAX_KEYS).map((v) => scrub(v, depth + 1));
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (typeof value === 'object') {
    const out = {};
    let count = 0;
    for (const [key, raw] of Object.entries(value)) {
      if (count >= MAX_KEYS) break;
      if (isSensitiveKey(key)) {
        out[key] = '[REDACTED]';
        count += 1;
        continue;
      }
      const cleaned = scrub(raw, depth + 1);
      if (cleaned === undefined) continue;
      out[key] = cleaned;
      count += 1;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return undefined;
}

const auditLogSchema = new mongoose.Schema(
  {
    /** 'system' or the actor's stable user reference. */
    actorId: { type: String, index: true },
    actorRole: { type: String },
    action: { type: String, required: true, index: true, trim: true, maxlength: 120 }, // e.g. 'giveaway.status.update'
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, required: true, index: true },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    /** Outcome of the action, so failures are auditable too. */
    result: { type: String, enum: ['SUCCESS', 'FAILURE', 'DENIED'], default: 'SUCCESS' },
    reason: { type: String, trim: true, maxlength: 300 },
    requestId: { type: String, index: true, trim: true },
    /** Coarse only — a hashed IP would live on FraudEvent, not here. */
    country: { type: String, uppercase: true, maxlength: 2 },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      versionKey: false,
      transform(doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        return ret;
      },
    },
    toObject: { versionKey: false },
  },
);

// Newest-first browsing + "history of this entity".
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });

/**
 * The only sanctioned way to write an audit entry. Snapshots are scrubbed here so
 * leaking PII into the trail requires deliberately bypassing this helper.
 * `session` lets the entry join the caller's MongoDB transaction, so a state change
 * and its audit record commit (or roll back) together.
 */
auditLogSchema.statics.record = function record({
  actorId = 'system',
  actorRole,
  action,
  entityType,
  entityId,
  before,
  after,
  result = 'SUCCESS',
  reason,
  requestId,
  country,
  metadata,
  session,
} = {}) {
  if (!action || !entityType || entityId === undefined || entityId === null) {
    throw new Error('AUDIT_INCOMPLETE: action, entityType and entityId are required.');
  }
  // Build a document and save it, so `session` is honoured. Mongoose cannot attach
  // a session to `Model.create(singleDoc, { session })` (it needs the array form),
  // and `save({ session })` returns the one document callers expect.
  const doc = new this({
    actorId: String(actorId),
    actorRole,
    action,
    entityType,
    entityId: String(entityId),
    before: scrub(before),
    after: scrub(after),
    result,
    reason,
    requestId,
    country,
    metadata: scrub(metadata),
  });
  return doc.save(session ? { session } : undefined);
};

auditLogSchema.statics.scrub = scrub;
auditLogSchema.statics.SENSITIVE_KEY_PARTS = SENSITIVE_KEY_PARTS;

// Append-only: no updates, no deletes (retention is an ops/offline concern).
auditLogSchema.pre('save', function refuseUpdate(next) {
  if (!this.isNew) {
    return next(new Error('AUDIT_APPEND_ONLY: audit entries cannot be modified.'));
  }
  next();
});
auditLogSchema.pre('findOneAndUpdate', function refuseUpdateQuery(next) {
  next(new Error('AUDIT_APPEND_ONLY: audit entries cannot be modified.'));
});
auditLogSchema.pre('updateOne', function refuseUpdateOne(next) {
  next(new Error('AUDIT_APPEND_ONLY: audit entries cannot be modified.'));
});
auditLogSchema.pre('updateMany', function refuseUpdateMany(next) {
  next(new Error('AUDIT_APPEND_ONLY: audit entries cannot be modified.'));
});
blockDelete(auditLogSchema, { label: 'audit-log' });

/** Written by the dev seed only; null on every real record. */
withSeedMarker(auditLogSchema);

module.exports = mongoose.model('AuditLog', auditLogSchema);
