/**
 * adminReward.controller — thin handlers over the admin reward service. The whole
 * router runs behind authenticate → requireAdmin → resolveIdentity → requireAdmin,
 * so every actor here is a store-confirmed administrator.
 */
const { asyncHandler } = require('../utils/asyncHandler.js');
const { ok, created } = require('../utils/respond.js');
const service = require('../services/adminReward.service.js');
const activityService = require('../services/rewardActivity.service.js');

const actor = (req) => req.auth.userId;
const rid = (req) => req.id;

// ---- activities -----------------------------------------------------------
const listActivities = asyncHandler(async (req, res) => ok(res, await service.listActivities({})));
const createActivity = asyncHandler(async (req, res) =>
  created(res, await service.createActivity({ body: req.valid.body, actorUserId: actor(req), requestId: rid(req) })));
const updateActivity = asyncHandler(async (req, res) =>
  ok(res, await service.updateActivity({ activityId: req.valid.params.id, body: req.valid.body, actorUserId: actor(req), requestId: rid(req) })));
const activityClaims = asyncHandler(async (req, res) => {
  const { items, meta } = await activityService.claimHistory({
    activityId: req.valid.params.id,
    page: req.valid.query.page,
    limit: req.valid.query.limit,
  });
  return ok(res, items, meta);
});

// ---- reward codes ---------------------------------------------------------
const listCodes = asyncHandler(async (req, res) => ok(res, await service.listCodes()));
const createCode = asyncHandler(async (req, res) =>
  created(res, await service.createCode({ body: req.valid.body, actorUserId: actor(req), requestId: rid(req) })));
const updateCode = asyncHandler(async (req, res) =>
  ok(res, await service.updateCode({ codeId: req.valid.params.id, body: req.valid.body, actorUserId: actor(req), requestId: rid(req) })));
const generateCodes = asyncHandler(async (req, res) =>
  created(res, await service.generateCodes({ body: req.valid.body, actorUserId: actor(req), requestId: rid(req) })));
const codeRedemptions = asyncHandler(async (req, res) => {
  const { items, meta } = await service.codeRedemptions({
    codeId: req.valid.params.id,
    page: req.valid.query.page,
    limit: req.valid.query.limit,
  });
  return ok(res, items, meta);
});
const redemptionReport = asyncHandler(async (req, res) => {
  const { items, meta } = await service.redemptionReport({
    code: req.valid.query.code,
    page: req.valid.query.page,
    limit: req.valid.query.limit,
  });
  return ok(res, items, meta);
});

// ---- referrals ------------------------------------------------------------
const getReferralConfig = asyncHandler(async (req, res) => ok(res, await service.getReferralConfig()));
const updateReferralConfig = asyncHandler(async (req, res) =>
  ok(res, await service.updateReferralConfig(req.valid.body, { actorUserId: actor(req) })));
const listReferrals = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listReferrals({
    status: req.valid.query.status,
    page: req.valid.query.page,
    limit: req.valid.query.limit,
  });
  return ok(res, items, meta);
});
const reviewReferral = asyncHandler(async (req, res) =>
  ok(res, await service.reviewReferral({
    referralId: req.valid.params.id,
    decision: req.valid.body.decision,
    note: req.valid.body.note,
    actorUserId: actor(req),
    requestId: rid(req),
  })));

// ---- wallets & ledger -----------------------------------------------------
const listWallets = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listWallets({
    page: req.valid.query.page,
    limit: req.valid.query.limit,
  });
  return ok(res, items, meta);
});
const adjustWallet = asyncHandler(async (req, res) =>
  ok(res, await service.adjustWallet({
    userId: req.valid.params.userId,
    currency: req.valid.body.currency,
    amount: req.valid.body.amount,
    direction: req.valid.body.direction,
    reason: req.valid.body.reason,
    actorUserId: actor(req),
    requestId: rid(req),
  })));
const listTransactions = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listTransactions({
    userId: req.valid.query.userId,
    type: req.valid.query.type,
    currency: req.valid.query.currency,
    page: req.valid.query.page,
    limit: req.valid.query.limit,
  });
  return ok(res, items, meta);
});
const stats = asyncHandler(async (req, res) => ok(res, await service.stats()));

module.exports = {
  listActivities,
  createActivity,
  updateActivity,
  activityClaims,
  listCodes,
  createCode,
  updateCode,
  generateCodes,
  codeRedemptions,
  redemptionReport,
  getReferralConfig,
  updateReferralConfig,
  listReferrals,
  reviewReferral,
  listWallets,
  adjustWallet,
  listTransactions,
  stats,
};
