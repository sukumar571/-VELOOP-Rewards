/** claimsApi — the winner's own claims. A claim is keyed by its OWN id (not a
 *  giveaway id); ownership is enforced by the server, which answers a non-owner
 *  with 404 (never 403) so the existence of another winner's claim is not leaked. */
import { get, post } from './client.js';

/** GET /claims?status=&giveawayId=&page=&limit= */
export async function list(params) {
  const { data, meta } = await get('/claims', { query: params });
  return { items: data || [], meta };
}

/** GET /claims/:id — the caller's own claim (masked fulfilment). */
export async function getById(claimId) {
  const { data } = await get(`/claims/${claimId}`);
  return data;
}

/** POST /claims/:id/submit — supply fulfilment for { physical | digital }. */
export async function submit(claimId, fulfillment) {
  const { data } = await post(`/claims/${claimId}/submit`, { fulfillment });
  return data;
}
