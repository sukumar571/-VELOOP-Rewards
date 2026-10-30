/**
 * Request validators for the claim endpoints (winner submit + admin review).
 *
 * Structural validation only at the edge: WHICH fulfilment fields are required is
 * a business rule that lives in the claim service / CLAIM_TYPE_FULFILMENT_SHAPE,
 * so a wrong shape returns the domain `CLAIM_DETAILS_INVALID` (with the missing
 * field names) rather than a generic schema error. The validator still bounds
 * every value and refuses an injected `userId`.
 */
const { z } = require('zod');
const { objectId, pagination, claimStatus, claimType } = require('./common.js');

const idParam = z.object({ id: objectId });

const physicalDetails = z
  .object({
    // These keys MUST match prizeClaim.model `physicalFulfilment` and
    // PrizeClaim.REQUIRED_PHYSICAL_FIELDS — the claim service re-checks them
    // after this structural pass. An earlier draft used recipientName/addressLine1/
    // region, which the .strict() guard then rejected as unknown, making a
    // physical HTTP submit impossible; aligning the names restores that path.
    fullName: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(20).optional(),
    address: z.string().trim().max(400).optional(),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().max(80).optional(),
    country: z.string().trim().length(2).toUpperCase().optional(),
    postalCode: z.string().trim().max(12).optional(),
  })
  .strict();

const digitalDetails = z
  .object({
    deliveryEmail: z.string().trim().email().max(320).optional(),
  })
  .strict();

/** POST /claims/:id/submit — the winner's fulfilment, never their identity. */
const submitBody = z
  .object({
    fulfillment: z
      .object({
        physical: physicalDetails.optional(),
        digital: digitalDetails.optional(),
      })
      .strict(),
  })
  .strict();

/** GET /claims — the caller's own claims. */
const myClaimsQuery = z.object({
  status: claimStatus.optional(),
  giveawayId: objectId.optional(),
  ...pagination,
});

/** GET /admin/claims — the operator queue. */
const adminListQuery = z.object({
  status: claimStatus.optional(),
  claimType: claimType.optional(),
  giveawayId: objectId.optional(),
  ...pagination,
});

/** POST /admin/claims/:id/review — an allowed transition target + optional note. */
const reviewBody = z
  .object({
    status: claimStatus,
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

/** POST /admin/claims/:id/extend — move the deadline forwards, audited. */
const extendBody = z
  .object({
    days: z.coerce.number().int().min(1).max(365).optional(),
    until: z.string().datetime().optional(),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.days) !== Boolean(v.until), {
    message: 'Provide exactly one of `days` or `until`.',
  });

/** POST /admin/claims/expire — optional scope to one giveaway. */
const expireBody = z.object({ giveawayId: objectId.optional() }).strict();

module.exports = {
  idParam,
  submitBody,
  myClaimsQuery,
  adminListQuery,
  reviewBody,
  extendBody,
  expireBody,
};
