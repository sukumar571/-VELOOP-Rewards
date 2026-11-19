/**
 * wallet.controller — read-only view of the caller's external wallet balances.
 *
 * The userId comes from the verified token; there is no way to ask about another
 * account. The service owns the "configured vs cached vs unknown" distinction and
 * raises 503 WALLET_NOT_CONFIGURED when nothing can be reported at all.
 */
const { asyncHandler } = require('../utils/asyncHandler.js');
const service = require('../services/wallet.service.js');
const redeemService = require('../services/redeem.service.js');
const { ok } = require('../utils/respond.js');

// GET /api/v1/wallet/balances?currencies=VE,TOKEN
const balances = asyncHandler(async (req, res) => {
  const data = await service.balances({
    userId: req.auth.userId, // from the verified token, never the query
    currencies: req.valid.query.currencies,
  });
  return ok(res, data);
});

// GET /api/v1/wallet/transactions?page=&limit= — the caller's own entry-fee
// ledger history. Scoped strictly to the token identity; never another account.
const transactions = asyncHandler(async (req, res) => {
  const { items, meta } = await service.transactionHistory({
    userId: req.auth.userId,
    page: req.valid.query.page,
    limit: req.valid.query.limit,
  });
  return ok(res, items, meta);
});

// GET /api/v1/wallet/codes — the promo catalogue + which codes this caller used.
const codes = asyncHandler(async (req, res) => {
  const data = await redeemService.listCodes({ userId: req.auth.userId });
  return ok(res, data);
});

// POST /api/v1/wallet/redeem — credit one promo code. The credit amount comes
// from the server-side catalogue, never from the request body.
const redeem = asyncHandler(async (req, res) => {
  const data = await redeemService.redeem({
    userId: req.auth.userId,
    code: req.valid.body.code,
    requestId: req.id,
  });
  return ok(res, data);
});

module.exports = { balances, transactions, codes, redeem };
