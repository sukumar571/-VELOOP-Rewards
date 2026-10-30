/**
 * review.controller — admin-only surface for suspicious events and audit records.
 *
 * Reads never re-hydrate identities: a fraud event is returned as references +
 * hashes + the measured signal, and the audit trail is returned as the scrubbed
 * entries the model already wrote. Decisions are attributed to the operator from
 * the verified token (`req.auth.userId`), never a body field.
 */
const { asyncHandler } = require('../utils/asyncHandler.js');
const service = require('../services/review.service.js');
const participation = require('../services/participation.service.js');
const { ok } = require('../utils/respond.js');

// GET /api/v1/admin/fraud-events
const listFraud = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listFraudEvents(req.valid.query);
  return ok(res, items, meta);
});

// GET /api/v1/admin/fraud-events/:id
const getFraud = asyncHandler(async (req, res) => ok(res, await service.getFraudEvent(req.valid.params.id)));

// POST /api/v1/admin/fraud-events/:id/decision
const decideFraud = asyncHandler(async (req, res) => {
  const data = await service.decideFraudEvent({
    eventId: req.valid.params.id,
    decision: req.valid.body.decision,
    note: req.valid.body.note,
    actorUserId: req.auth.userId,
    requestId: req.id,
  });
  return ok(res, data);
});

// POST /api/v1/admin/fraud-events/:id/review — soft claim (OPEN -> UNDER_REVIEW).
const reviewFraud = asyncHandler(async (req, res) => {
  const data = await service.claimForReview({
    eventId: req.valid.params.id,
    actorUserId: req.auth.userId,
    requestId: req.id,
  });
  return ok(res, data);
});

// GET /api/v1/admin/audit-logs
const listAudit = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listAuditLogs(req.valid.query);
  return ok(res, items, meta);
});

// GET /api/v1/admin/audit-logs/:entityType/:entityId
const entityHistory = asyncHandler(async (req, res) => {
  const { items, meta, ...scope } = await service.entityAuditHistory({
    ...req.valid.params,
    ...req.valid.query,
  });
  return ok(res, { ...scope, items }, meta);
});

// POST /api/v1/admin/participations/:id/void — void/disqualify (+ optional refund).
// Kept here because it is an enforcement action, alongside the fraud queue.
const voidParticipation = asyncHandler(async (req, res) => {
  const result = await participation.voidParticipation({
    participationId: req.valid.params.id,
    actorUserId: req.auth.userId,
    reason: req.valid.body.reason,
    mode: req.valid.body.mode,
    refund: req.valid.body.refund,
  });
  return ok(res, { participation: result.participation, reversal: result.reversal });
});

module.exports = { listFraud, getFraud, decideFraud, reviewFraud, listAudit, entityHistory, voidParticipation };
