/**
 * Request validators for the wallet endpoints.
 *
 * Balances are READ-ONLY and always about the caller: there is no user id in the
 * query. `currencies` narrows which wallets to observe; an unknown currency is a
 * 400 rather than a silent empty row.
 */
const { z } = require('zod');
const { currency } = require('./common.js');

/** GET /wallet/balances?currencies=VE,TOKEN */
const balancesQuery = z.object({
  currencies: z
    .preprocess(
      (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v),
      z.array(currency).max(10).optional(),
    ),
});

module.exports = { balancesQuery };
