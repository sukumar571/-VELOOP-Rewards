/** walletApi — the wallet surface. Balances are read-only observations; the only
 *  balance-changing call is promo-code redemption, whose amount is decided by the
 *  server-side catalogue (the client sends a code, never an amount). */
import { get, post } from './client.js';

/** GET /wallet/balances?currencies=VE,SVE,TOKEN */
export async function balances(currencies) {
  const query =
    Array.isArray(currencies) && currencies.length
      ? { currencies: currencies.join(',') }
      : undefined;
  const { data } = await get('/wallet/balances', { query });
  return data;
}

/** GET /wallet/codes -> { redemptionAvailable, codes: [{ code, currency, amount, label, redeemed }] } */
export async function codes() {
  const { data } = await get('/wallet/codes');
  return data;
}

/** POST /wallet/redeem { code } -> { code, currency, amount, balance } */
export async function redeem(rawCode) {
  const { data } = await post('/wallet/redeem', { code: rawCode });
  return data;
}
