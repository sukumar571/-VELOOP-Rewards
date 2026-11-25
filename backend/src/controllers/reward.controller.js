/**
 * reward.controller — the signed-in member's reward wallet surface.
 * Every handler derives the account from `req.auth.userId` (verified token +
 * resolved store identity), so no request can name another account.
 */
const { asyncHandler } = require('../utils/asyncHandler.js');
const { ok, created } = require('../utils/respond.js');
const ledger = require('../services/rewardLedger.service.js');
const activities = require('../services/rewardActivity.service.js');
const referral = require('../services/referral.service.js');
const codes = require('../services/rewardCode.service.js');

// GET /rewards/wallet
const wallet = asyncHandler(async (req, res) =>
  ok(res, await ledger.walletSummary({ userId: req.auth.userId })));

// GET /rewards/transactions
const transactions = asyncHandler(async (req, res) => {
  const { items, meta } = await ledger.history({
    userId: req.auth.userId,
    page: req.valid.query.page,
    limit: req.valid.query.limit,
    currency: req.valid.query.currency,
    type: req.valid.query.type,
  });
  return ok(res, items, meta);
});

// GET /rewards/activities
const listActivities = asyncHandler(async (req, res) =>
  ok(res, await activities.listForUser({ userId: req.auth.userId })));

// POST /rewards/activities/:id/claim
const claimActivity = asyncHandler(async (req, res) =>
  created(res, await activities.claim({
    userId: req.auth.userId,
    activityId: req.valid.params.id,
    requestId: req.id,
  })));

// GET /rewards/referral
const referralOverview = asyncHandler(async (req, res) =>
  ok(res, await referral.overview({ userId: req.auth.userId, requestId: req.id })));

// GET /rewards/codes
const listCodes = asyncHandler(async (req, res) =>
  ok(res, await codes.listForUser({ userId: req.auth.userId })));

// POST /rewards/codes/validate
const validateCode = asyncHandler(async (req, res) =>
  ok(res, await codes.validateCode({ userId: req.auth.userId, rawCode: req.valid.body.code })));

// POST /rewards/codes/redeem
const redeemCode = asyncHandler(async (req, res) =>
  ok(res, await codes.redeem({
    userId: req.auth.userId,
    rawCode: req.valid.body.code,
    requestId: req.id,
  })));

// GET /rewards/redemptions
const redemptions = asyncHandler(async (req, res) =>
  ok(res, await codes.history({ userId: req.auth.userId })));

module.exports = {
  wallet,
  transactions,
  listActivities,
  claimActivity,
  referralOverview,
  listCodes,
  validateCode,
  redeemCode,
  redemptions,
};
