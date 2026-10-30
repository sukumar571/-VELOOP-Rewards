/** walletApi — a READ-ONLY view of the external wallet. The frontend never
 *  mutates a balance and never fabricates one; the service distinguishes
 *  configured / cached / unknown and 503s when nothing can be reported. */
import { get } from './client.js';

/** GET /wallet/balances?currencies=VE,SVE,TOKEN */
export async function balances(currencies) {
  const query =
    Array.isArray(currencies) && currencies.length
      ? { currencies: currencies.join(',') }
      : undefined;
  const { data } = await get('/wallet/balances', { query });
  return data;
}
