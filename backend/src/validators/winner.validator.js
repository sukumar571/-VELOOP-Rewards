/**
 * Request validators for the winner endpoints (public read + admin draw/publish).
 */
const { z } = require('zod');
const { objectId, pagination, announcementStatus, verificationStatus } = require('./common.js');

const idParam = z.object({ id: objectId });

/** GET /giveaways/:id/winners — public, masked, paginated. */
const publicWinnersQuery = z.object({ ...pagination });

/** GET /admin/giveaways/:id/winners — full rows for review. */
const adminWinnersQuery = z.object({
  prizeId: objectId.optional(),
  announcementStatus: announcementStatus.optional(),
  ...pagination,
});

/** POST /admin/giveaways/:id/winners/draw — an optional `count` caps the run. */
const drawBody = z
  .object({
    prizeId: objectId,
    count: z.coerce.number().int().min(1).max(1000).optional(),
  })
  .strict();

/** POST .../winners/publish and .../winners/notify — scoped to one prize optionally. */
const scopeBody = z
  .object({ prizeId: objectId.optional() })
  .strict();

/** PATCH /admin/winners/:id — the operator's eligibility decision. */
const verificationBody = z
  .object({
    verificationStatus,
    reason: z.string().trim().max(300).optional(),
  })
  // `reason` is required to DISQUALIFY, so a win is never removed without a
  // recorded justification (the model stores it; this makes it explicit at the edge).
  .refine((v) => v.verificationStatus !== 'DISQUALIFIED' || (v.reason && v.reason.length > 0), {
    message: 'A disqualification requires a reason.',
    path: ['reason'],
  });

module.exports = { idParam, publicWinnersQuery, adminWinnersQuery, drawBody, scopeBody, verificationBody };
