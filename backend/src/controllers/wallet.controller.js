/**
 * wallet.controller — read-only view of the caller's external wallet balances.
 *
 * The userId comes from the verified token; there is no way to ask about another
 * account. The service owns the "configured vs cached vs unknown" distinction and
 * raises 503 WALLET_NOT_CONFIGURED when nothing can be reported at all.
 */
const { asyncHandler } = require('../utils/asyncHandler.js');
const service = require('../services/wallet.service.js');
const { ok } = require('../utils/respond.js');

// GET /api/v1/wallet/balances?currencies=VE,TOKEN
const balances = asyncHandler(async (req, res) => {
  const data = await service.balances({
    userId: req.auth.userId, // from the verified token, never the query
    currencies: req.valid.query.currencies,
  });
  return ok(res, data);
});

module.exports = { balances };
