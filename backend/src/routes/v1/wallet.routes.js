/**
 * Wallet routes — a read-only, identity-scoped view of the external VELOOP wallet.
 * There is no POST here: this application never mutates a balance, it only
 * reports observations (and refuses to invent one).
 */
const express = require('express');
const { validate } = require('../../middleware/validate.js');
const { authenticate } = require('../../middleware/auth.js');
const { resolveIdentity, requireResolvedIdentity } = require('../../middleware/identity.js');
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

module.exports = router;
