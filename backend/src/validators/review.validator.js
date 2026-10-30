/**
 * Request validators for the fraud-event and audit-log review endpoints.
 *
 * Filters are constrained to the indexed equality fields (action, entityType,
 * status, …) so a review query cannot become a full-collection scan of the Mixed
 * snapshot bodies, which could hold arbitrary content.
 */
const { z } = require('zod');
const {
  objectId,
  pagination,
  fraudStatus,
  fraudSeverity,
  fraudType,
  safeIdentifier,
} = require('./common.js');

const idParam = z.object({ id: objectId });

/** GET /admin/fraud-events — the review queue (open/under-review first). */
const fraudListQuery = z.object({
  status: fraudStatus.optional(),
  severity: fraudSeverity.optional(),
  type: fraudType.optional(),
  giveawayId: objectId.optional(),
  userId: objectId.optional(),
  ...pagination,
});

/** POST /admin/fraud-events/:id/decision — a final, recorded outcome. */
const decisionBody = z
  .object({
    decision: z.enum(['DISMISSED', 'CONFIRMED']),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

/** POST /admin/fraud-events/:id/review — a soft claim, no outcome yet. */
const reviewClaimBody = z.object({ note: z.string().trim().max(500).optional() }).strict();

/** GET /admin/audit-logs — newest first, filtered by the indexed fields. */
const auditListQuery = z.object({
  action: z.string().trim().min(1).max(120).optional(),
  entityType: safeIdentifier.optional(),
  entityId: z.string().trim().min(1).max(120).optional(),
  actorId: z.string().trim().min(1).max(120).optional(),
  result: z.enum(['SUCCESS', 'FAILURE', 'DENIED']).optional(),
  requestId: z.string().trim().min(1).max(120).optional(),
  ...pagination,
});

/** GET /admin/audit-logs/:entityType/:entityId — the history of one resource. */
const entityHistoryParams = z.object({
  entityType: safeIdentifier,
  entityId: z.string().trim().min(1).max(120),
});
const entityHistoryQuery = z.object({ ...pagination });

module.exports = {
  idParam,
  fraudListQuery,
  decisionBody,
  reviewClaimBody,
  auditListQuery,
  entityHistoryParams,
  entityHistoryQuery,
};
