/**
 * participation.controller — the HTTP layer over participation.service.
 *
 * Identity rule in force here: `userId` is read ONLY from `req.auth.userId`,
 * which `resolveIdentity` populated from the verified access token. It is never
 * taken from the body/query, so one account cannot enter or inspect another's
 * participation by supplying an id. `requireResolvedIdentity` has already refused
 * the request if the store was unreachable, so `userId` is a real account row.
 */
const { asyncHandler } = require('../utils/asyncHandler.js');
const service = require('../services/participation.service.js');
const { resolveGeo } = require('../services/eligibility.service.js');
const { created, ok } = require('../utils/respond.js');

/** Everything the entry path needs that is not in the body, gathered in one place. */
function entryContext(req, body) {
  return {
    requestId: req.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    geo: resolveGeo(req),
    deviceReference: body.deviceReference,
    sessionReference: body.sessionReference,
  };
}

// POST /api/v1/giveaways/:id/join
const join = asyncHandler(async (req, res) => {
  const { id: giveawayId } = req.valid.params;
  const body = req.valid.body;
  const result = await service.join({
    giveawayId,
    userId: req.auth.userId, // from the verified token, never the body
    entries: body.entries,
    currency: body.currency,
    prizeId: body.prizeId,
    context: entryContext(req, body),
    idempotencyKey: req.valid.headers && req.valid.headers['idempotency-key'],
  });
  return created(res, {
    participation: result.participation,
    giveaway: { id: String(result.giveaway._id), title: result.giveaway.title, status: result.giveaway.status },
    prize: { id: String(result.prize._id), name: result.prize.name },
    pricing: result.pricing,
    balance: result.balance || null,
    replayed: Boolean(result.replayed),
  });
});

// GET /api/v1/giveaways/my-status
const myStatus = asyncHandler(async (req, res) => {
  const q = req.valid.query;
  const { items, meta } = await service.myParticipations({
    userId: req.auth.userId,
    giveawayId: q.giveawayId,
    status: q.status,
    page: q.page,
    limit: q.limit,
  });
  return ok(res, items, meta);
});

// GET /api/v1/giveaways/:id/my-status — one draw's entry state for the caller.
const giveawayStatus = asyncHandler(async (req, res) => {
  const data = await service.myStatusForGiveaway({
    userId: req.auth.userId,
    giveawayId: req.valid.params.id,
  });
  return ok(res, data);
});

module.exports = { join, myStatus, giveawayStatus };
