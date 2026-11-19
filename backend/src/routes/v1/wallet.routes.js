/**
 * Wallet routes — a read-only, identity-scoped view of the external VELOOP wallet.
 * There is no POST here: this application never mutates a balance, it only
 * reports observations (and refuses to invent one).
 */
const express = require('express');
const { validate } = require('../../middleware/validate.js');
const { authenticate } = require('../../middleware/auth.js');
const { resolveIdentity, requireResolvedIdentity } = require('../../middleware/identity.js');
const { entryLimiter } = require('../../middleware/rateLimiter.js');
const wallet = require('../../controllers/wallet.controller.js');
const schemas = require('../../validators/wallet.validator.js');

const router = express.Router();

// GET /api/v1/wallet/balances?currencies=VE,TOKEN
router.get(
  '/balances',
  authenticate,
  resolveIdentity,
  requireResolvedIdentity,
  validate({ query: schemas.balancesQuery }),
  wallet.balances,
);

// GET /api/v1/wallet/transactions?page=&limit= — own ledger history (read-only).
router.get(
  '/transactions',
  authenticate,
  validate({ query: schemas.transactionsQuery }),
  resolveIdentity,
  requireResolvedIdentity,
  wallet.transactions,
);

// GET /api/v1/wallet/codes — promo catalogue + the caller's redemption state.
router.get('/codes', authenticate, resolveIdentity, requireResolvedIdentity, wallet.codes);

// POST /api/v1/wallet/redeem — credits a promo code. It moves balance, so it gets
// the tighter entry budget rather than the global one.
router.post(
  '/redeem',
  authenticate,
  resolveIdentity,
  requireResolvedIdentity,
  entryLimiter,
  validate({ body: schemas.redeemBody }),
  wallet.redeem,
);

module.exports = router;
