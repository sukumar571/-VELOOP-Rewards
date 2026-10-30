/** participationApi — the caller's own entry state and the join (money) path.
 *  Identity is derived from the verified token by the server; the body NEVER
 *  carries a userId, fee, amount or balance. */
import { get, post } from './client.js';

/** GET /giveaways/:id/my-status (authenticated). */
export async function myStatus(giveawayId) {
  const { data } = await get(`/giveaways/${giveawayId}/my-status`);
  return data;
}

/** GET /giveaways/my-status — all of the caller's entries (paginated). */
export async function myParticipations(params) {
  const { data, meta } = await get('/giveaways/my-status', { query: params });
  return { items: data || [], meta };
}

/**
 * POST /giveaways/:id/join. Only the keys the strict validator accepts are sent
 * (undefined values are stripped by JSON.stringify). A fresh Idempotency-Key is
 * generated per logical join so a network retry replays instead of double-
 * charging — but the authoritative double-entry guard is the backend's unique
 * (userId, giveawayId[, prizeId]) index, not this client key.
 */
export async function join(giveawayId, { entries = 1, currency, prizeId } = {}) {
  const body = { entries };
  if (currency) body.currency = currency;
  if (prizeId) body.prizeId = prizeId;
  const { data } = await post(`/giveaways/${giveawayId}/join`, body, {
    idempotencyKey: makeIdempotencyKey(),
  });
  return data;
}

function makeIdempotencyKey() {
  try {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    }
  } catch {
    /* fall through to the timestamp key */
  }
  // 16-128 chars of [A-Za-z0-9_-]; time + random keeps it unique enough.
  return `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`.replace(
    /[^A-Za-z0-9_-]/g,
    '',
  );
}
