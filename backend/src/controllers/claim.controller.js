/**
 * claim.controller — the WINNER's side of fulfilment.
 *
 * Every call is scoped to `req.auth.userId`; the service returns 404 (not 403) for
 * a claim the caller cannot see, so the existence of someone else's claim is never
 * leaked. Admin reads/reviews live in admin.controller, not here.
 */
const { asyncHandler } = require('../utils/asyncHandler.js');
const service = require('../services/claim.service.js');
const { ok, created } = require('../utils/respond.js');

// GET /api/v1/claims — the caller's claims, deadline order.
const myClaims = asyncHandler(async (req, res) => {
  const q = req.valid.query;
  const { items, meta } = await service.myClaims({
    userId: req.auth.userId,
    status: q.status,
    giveawayId: q.giveawayId,
    page: q.page,
    limit: q.limit,
  });
  return ok(res, items, meta);
});

// GET /api/v1/claims/:id — one claim the caller owns (masked fulfilment).
const getClaim = asyncHandler(async (req, res) => {
  const { view, data } = await service.getClaim({
    claimId: req.valid.params.id,
    auth: { userId: req.auth.userId, isAdmin: req.auth.isAdmin },
  });
  return ok(res, { view, ...data });
});

// POST /api/v1/claims/:id/submit — supply fulfilment details before the deadline.
const submitClaim = asyncHandler(async (req, res) => {
  const data = await service.submitClaim({
    claimId: req.valid.params.id,
    userId: req.auth.userId,
    fulfillment: req.valid.body.fulfillment,
    requestId: req.id,
  });
  return created(res, data);
});

module.exports = { myClaims, getClaim, submitClaim };
