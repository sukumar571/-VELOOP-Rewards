/** winnersApi — the PUBLIC announced-winner view. The server only ever returns
 *  ANNOUNCED, masked rows; a draw whose results are not published yet is a
 *  RESULTS_NOT_AVAILABLE (409), which callers translate to an honest empty list
 *  rather than a fake or premature announcement. */
import { get, ApiClientError } from './client.js';

/** GET /giveaways/:id/winners -> { giveaway, items } (or [] when unpublished). */
export async function forGiveaway(giveawayId, params) {
  try {
    const { data, meta } = await get(`/giveaways/${giveawayId}/winners`, { query: params });
    return { giveaway: data?.giveaway || null, items: data?.items || [], meta };
  } catch (err) {
    if (err instanceof ApiClientError && (err.code === 'RESULTS_NOT_AVAILABLE' || err.status === 404)) {
      return { giveaway: null, items: [], meta: undefined };
    }
    throw err;
  }
}
