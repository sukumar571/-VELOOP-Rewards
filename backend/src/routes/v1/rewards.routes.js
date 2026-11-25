/**
 * Member reward routes — `/api/v1/rewards/*`.
 *
 * Every route requires a verified token AND a resolved account row, because each
 * one reads or moves that account's own balances. Claim and redeem carry the
 * tighter money budget; reads use the global limiter.
 */
const express = require('express');
const { authenticate } = require('../../middleware/auth.js');
const { resolveIdentity, requireResolvedIdentity } = require('../../middleware/identity.js');
const { entryLimiter, claimLimiter } = require('../../middleware/rateLimiter.js');
const { validate } = require('../../middleware/validate.js');
const rewards = require('../../controllers/reward.controller.js');
const schemas = require('../../validators/rewards.validator.js');

const router = express.Router();

router.use(authenticate, resolveIdentity, requireResolvedIdentity);

// ---- wallet & history -----------------------------------------------------
router.get('/wallet', rewards.wallet);
router.get('/transactions', validate({ query: schemas.historyQuery }), rewards.transactions);

// ---- activities -----------------------------------------------------------
router.get('/activities', rewards.listActivities);
router.post(
  '/activities/:id/claim',
  validate({ params: schemas.activityParams }),
  claimLimiter,
  rewards.claimActivity,
);

// ---- referral -------------------------------------------------------------
router.get('/referral', rewards.referralOverview);

// ---- reward codes ---------------------------------------------------------
router.get('/codes', rewards.listCodes);
router.post('/codes/validate', validate({ body: schemas.codeBody }), rewards.validateCode);
router.post(
  '/codes/redeem',
  validate({ body: schemas.codeBody }),
  entryLimiter,
  rewards.redeemCode,
);
router.get('/redemptions', rewards.redemptions);

module.exports = router;
