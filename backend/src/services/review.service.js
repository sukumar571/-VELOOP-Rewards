/**
 * ============================================================================
 * REVIEW SERVICE — the operator's queue for fraud signals and the audit trail.
 * ============================================================================
 * Two read surfaces the specification requires of an admin:
 *
 *   "Reviewing suspicious events"  → FraudEvent list/detail/decision
 *   "Reviewing ... audit records"  → AuditLog list/entity history
 *
 * Privacy rule that shapes the fraud read: a FraudEvent deliberately stores
 * SALTED HASHES and coarse buckets only, and it references users by id. So the
 * list hands back those ids and hashes — which an operator can correlate with a
 * tool that has the right — and NOTHING here reverse-maps a hash to a person,
 * because this collection cannot. The decision path never deletes evidence:
 * an event is OPEN/UNDER_REVIEW until it is CONFIRMED or DISMISSED, and a made
 * decision is final (the model refuses a second one), so history is auditable.
 *
 * The audit read is the raw append-only trail. Entries are already scrubbed on
 * write (see AuditLog.scrub), so no new redaction is applied here — but nothing
 * is ever written through this service, only read.
 * ========================================================================= */
const FraudEvent = require('../models/fraudEvent.model.js');
const AuditLog = require('../models/auditLog.model.js');
const { domain } = require('../utils/domainErrors.js');
const { ApiError } = require('../utils/ApiError.js');
const { FRAUD_EVENT_STATUS } = require('../config/constants.js');

const DECISIONS = [FRAUD_EVENT_STATUS.DISMISSED, FRAUD_EVENT_STATUS.CONFIRMED];

/** Compact, analyst-facing projection: references + signal, never a rehydrated identity. */
function fraudView(doc) {
  return {
    id: String(doc._id),
    type: doc.type,
    severity: doc.severity,
    status: doc.status,
    actionTaken: doc.actionTaken,
    occurrenceCount: doc.occurrenceCount,
    firstSeenAt: doc.firstSeenAt,
    lastSeenAt: doc.lastSeenAt,
    userId: doc.userId ? String(doc.userId) : null,
    giveawayId: doc.giveawayId ? String(doc.giveawayId) : null,
    participationId: doc.participationId ? String(doc.participationId) : null,
    transactionId: doc.transactionId ? String(doc.transactionId) : null,
    // Correlation tokens are safe to show an admin: they are one-way digests.
    deviceHash: doc.deviceHash || null,
    sessionHash: doc.sessionHash || null,
    country: doc.country || null,
    clientClass: doc.clientClass || null,
    signal: doc.signal
      ? { ruleKey: doc.signal.ruleKey, metric: doc.signal.metric, observed: doc.signal.observed, threshold: doc.signal.threshold }
      : null,
    resolvedAt: doc.resolvedAt || null,
    resolvedBy: doc.resolvedBy ? String(doc.resolvedBy) : null,
    resolutionNote: doc.resolutionNote || null,
  };
}

/**
 * GET /admin/fraud-events — the open-first review queue.
 * `status`/`severity`/`giveawayId`/`type` are validated enums; newest activity first.
 */
async function listFraudEvents({ status, severity, type, giveawayId, userId, page = 1, limit = 20 } = {}) {
  const filter = {};
  if (status) filter.status = status;
  if (severity) filter.severity = severity;
  if (type) filter.type = type;
  if (giveawayId) filter.giveawayId = giveawayId;
  if (userId) filter.userId = userId;
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    FraudEvent.find(filter).sort({ lastSeenAt: -1, severity: -1 }).skip(skip).limit(limit).lean(),
    FraudEvent.countDocuments(filter),
  ]);
  return {
    items: rows.map(fraudView),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/** GET /admin/fraud-events/:id */
async function getFraudEvent(eventId) {
  const doc = await FraudEvent.findById(eventId).lean();
  if (!doc) throw domain('FRAUD_EVENT_NOT_FOUND');
  return fraudView(doc);
}

/**
 * POST /admin/fraud-events/:id/decision — record DISMISSED or CONFIRMED.
 * A decided event is final (the model invalidates a second decision); an
 * operator who disagrees opens a fresh event, so the trail is never rewritten.
 */
async function decideFraudEvent({ eventId, decision, note, actorUserId, requestId }) {
  if (!DECISIONS.includes(decision)) {
    throw ApiError.badRequest('A fraud decision must be DISMISSED or CONFIRMED.', { allowed: DECISIONS });
  }
  const doc = await FraudEvent.findById(eventId);
  if (!doc) throw domain('FRAUD_EVENT_NOT_FOUND');
  if (doc.status === FRAUD_EVENT_STATUS.CONFIRMED || doc.status === FRAUD_EVENT_STATUS.DISMISSED) {
    throw domain('FRAUD_EVENT_DECIDED', undefined, { status: doc.status, resolvedAt: doc.resolvedAt });
  }
  doc.status = decision;
  doc.resolvedBy = actorUserId;
  doc.resolvedAt = new Date();
  if (note) doc.resolutionNote = String(note).slice(0, 500);
  await doc.save();

  await AuditLog.record({
    actorId: actorUserId,
    actorRole: 'admin',
    action: `fraud_event.${decision.toLowerCase()}`,
    entityType: 'FraudEvent',
    entityId: doc._id,
    before: { status: doc.$__originalFraudStatus || 'OPEN' },
    after: { status: decision },
    reason: note ? 'note recorded' : undefined,
    requestId,
  }).catch(() => null);

  return fraudView(doc.toObject());
}

/**
 * Move an OPEN event into UNDER_REVIEW (a soft claim by an analyst), so two
 * reviewers can see who is looking at what. Not a decision.
 */
async function claimForReview({ eventId, actorUserId, requestId }) {
  const doc = await FraudEvent.findById(eventId);
  if (!doc) throw domain('FRAUD_EVENT_NOT_FOUND');
  if (doc.status !== FRAUD_EVENT_STATUS.OPEN) {
    throw domain('FRAUD_EVENT_DECIDED', 'Only an OPEN event can be moved to review.', { status: doc.status });
  }
  doc.status = FRAUD_EVENT_STATUS.UNDER_REVIEW;
  await doc.save();
  await AuditLog.record({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'fraud_event.under_review',
    entityType: 'FraudEvent',
    entityId: doc._id,
    after: { status: doc.status },
    requestId,
  }).catch(() => null);
  return fraudView(doc.toObject());
}

/**
 * GET /admin/audit-logs — the append-only trail, newest first.
 * Filters by the indexed equality fields only; a snapshot body is never searched
 * because those are Mixed and could contain anything.
 */
async function listAuditLogs({ action, entityType, entityId, actorId, result, requestId, page = 1, limit = 25 } = {}) {
  const filter = {};
  if (action) filter.action = action;
  if (entityType) filter.entityType = entityType;
  if (entityId) filter.entityId = entityId;
  if (actorId) filter.actorId = actorId;
  if (result) filter.result = result;
  if (requestId) filter.requestId = requestId;
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  return {
    items: rows.map((r) => ({
      id: String(r._id),
      actorId: r.actorId,
      actorRole: r.actorRole || null,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      result: r.result,
      reason: r.reason || null,
      requestId: r.requestId || null,
      country: r.country || null,
      before: r.before || null,
      after: r.after || null,
      createdAt: r.createdAt,
    })),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/** GET /admin/audit-logs/:entityType/:entityId — full history of one resource. */
async function entityAuditHistory({ entityType, entityId, page = 1, limit = 50 } = {}) {
  const filter = { entityType, entityId };
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  return {
    entityType,
    entityId,
    items: rows.map((r) => ({
      id: String(r._id),
      actorId: r.actorId,
      actorRole: r.actorRole || null,
      action: r.action,
      result: r.result,
      reason: r.reason || null,
      before: r.before || null,
      after: r.after || null,
      createdAt: r.createdAt,
    })),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

module.exports = {
  listFraudEvents,
  getFraudEvent,
  decideFraudEvent,
  claimForReview,
  listAuditLogs,
  entityAuditHistory,
  fraudView,
  DECISIONS,
};
