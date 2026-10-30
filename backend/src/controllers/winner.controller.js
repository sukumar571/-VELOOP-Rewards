/**
 * winner.controller — the public result view and the admin draw/publish tools.
 *
 * Public: `publicWinners` only ever returns ANNOUNCED, masked rows and never a
 * userId, so a client cannot enumerate who won. Admin: every action is attributed
 * to `req.auth.userId` (the operator from the verified token) and audited in the
 * service; nothing here trusts a caller-supplied actor id.
 */
const { asyncHandler } = require('../utils/asyncHandler.js');
const service = require('../services/winner.service.js');
const { ok, created, accepted } = require('../utils/respond.js');

// ---- public ---------------------------------------------------------------
// GET /api/v1/giveaways/:id/winners
const publicWinners = asyncHandler(async (req, res) => {
  const q = req.valid.query;
  const { giveaway, items, meta } = await service.publicWinners({
    giveawayId: req.valid.params.id,
    page: q.page,
    limit: q.limit,
  });
  return ok(res, { giveaway, items }, meta);
});

// ---- admin ----------------------------------------------------------------
// POST /api/v1/admin/giveaways/:id/winners/draw
const draw = asyncHandler(async (req, res) => {
  const result = await service.drawWinners({
    giveawayId: req.valid.params.id,
    prizeId: req.valid.body.prizeId,
    count: req.valid.body.count,
    actorUserId: req.auth.userId,
    requestId: req.id,
  });
  return created(res, {
    prizeId: String(result.prize._id),
    drawn: result.created.map((c) => ({ winnerId: String(c.winner._id), claimId: String(c.claim._id), rank: c.winner.rank })),
    candidateCount: result.candidateCount,
    claimWindowDays: result.claimWindowDays,
    freeSlotsAfter: result.freeSlotsAfter,
  });
});

// POST /api/v1/admin/giveaways/:id/winners/notify — HOLD -> PRIVATE_NOTIFIED.
const notify = asyncHandler(async (req, res) => {
  const result = await service.privateNotify({
    giveawayId: req.valid.params.id,
    prizeId: req.valid.body.prizeId,
    actorUserId: req.auth.userId,
    requestId: req.id,
  });
  return accepted(res, result);
});

// POST /api/v1/admin/giveaways/:id/winners/publish — make results public (one-way).
const publish = asyncHandler(async (req, res) => {
  const result = await service.publishWinners({
    giveawayId: req.valid.params.id,
    prizeId: req.valid.body.prizeId,
    actorUserId: req.auth.userId,
    requestId: req.id,
  });
  return ok(res, result);
});

// GET /api/v1/admin/giveaways/:id/winners — full rows for review.
const adminList = asyncHandler(async (req, res) => {
  const q = req.valid.query;
  const { items, meta } = await service.adminWinners({
    giveawayId: req.valid.params.id,
    prizeId: q.prizeId,
    announcementStatus: q.announcementStatus,
    page: q.page,
    limit: q.limit,
  });
  return ok(res, items, meta);
});

// PATCH /api/v1/admin/winners/:id — verify / disqualify a winner.
const setVerification = asyncHandler(async (req, res) => {
  const winner = await service.setVerification({
    winnerId: req.valid.params.id,
    verificationStatus: req.valid.body.verificationStatus,
    reason: req.valid.body.reason,
    actorUserId: req.auth.userId,
    requestId: req.id,
  });
  return ok(res, winner);
});

module.exports = { publicWinners, draw, notify, publish, adminList, setVerification };
