/**
 * Request validators for the entry / participation endpoints.
 *
 * The most important rule is invisible here on purpose: there is NO `userId`
 * field accepted on any body. Identity is derived from the verified access token
 * in `resolveIdentity`, so a caller cannot enter (or query) on someone else's
 * behalf by putting an id in the payload.
 */
const { z } = require('zod');
const { objectId, pagination, participationStatus, currency } = require('./common.js');

/** A client correlation reference: opaque, >= 8 chars, bounded; never PII. */
const clientReference = z.string().trim().min(8).max(200);

const idParam = z.object({ id: objectId });

/** POST /giveaways/:id/join */
const joinBody = z
  .object({
    entries: z.coerce.number().int().min(1).max(1000).default(1),
    currency: currency.optional(),
    prizeId: objectId.optional(),
    deviceReference: clientReference.optional(),
    sessionReference: clientReference.optional(),
  })
  // Any unknown key (a guessed `userId`, `role`, `status`, `amount`, `balance`) is
  // refused, not dropped silently — an entrant gets a clear 400 instead of a
  // surprising no-op. There is deliberately no field that can set the charged
  // amount, the balance or the participation status: those are server-resolved.
  .strict();

/**
 * Optional `Idempotency-Key` header for the join (money) path. A bounded, opaque
 * token (16-128 chars of [A-Za-z0-9_-]) so a retried request replays instead of
 * double-charging. A repeated header collapses to its first value.
 */
const joinHeaders = z.object({
  'idempotency-key': z
    .preprocess(
      (v) => (Array.isArray(v) ? v[0] : v),
      z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9_-]{16,128}$/, 'Idempotency-Key must be 16-128 characters of A-Z a-z 0-9 _ -.')
        .optional(),
    )
    .optional(),
});

/** GET /giveaways/my-status — the caller's own entries, optionally narrowed. */
const myStatusQuery = z.object({
  giveawayId: objectId.optional(),
  status: participationStatus.optional(),
  ...pagination,
});

module.exports = { idParam, joinBody, joinHeaders, myStatusQuery, clientReference };
