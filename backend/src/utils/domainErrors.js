/**
 * ============================================================================
 * DOMAIN ERRORS — the stable, client-facing error codes of the giveaway API.
 * ============================================================================
 * The specification asks for *useful, non-sensitive* codes (ALREADY_JOINED,
 * GIVEAWAY_ENDED, INSUFFICIENT_BALANCE, LOGIN_REQUIRED, CLAIM_EXPIRED, ...).
 * They live in ONE file so a controller cannot invent a synonym for an existing
 * situation and a client can rely on the string never changing per meaning.
 *
 * Every helper returns an ApiError, so the central error handler serializes it
 * identically to everything else: { error: { code, message, details? }, requestId }.
 * Messages here are always safe to expose: they describe the RULE that stopped the
 * request, never the internal state of another user or the database.
 * ========================================================================= */
const { ApiError } = require('./ApiError.js');

/**
 * Code catalogue. `status` is the HTTP status the API returns for that rule,
 * chosen by meaning: 401 credentials, 403 authorization, 404 invisible resource,
 * 409 a state conflict with the requested operation, 402/422 payment & business
 * rejections, 503 a dependency that is not reachable.
 */
const CODES = Object.freeze({
  // ---- authentication -------------------------------------------------------
  LOGIN_REQUIRED: { status: 401, message: 'A valid access token is required.' },
  TOKEN_EXPIRED: { status: 401, message: 'Access token has expired.' },
  INVALID_TOKEN: { status: 401, message: 'Access token is invalid.' },
  ACCOUNT_NOT_ACTIVE: { status: 403, message: 'This account may not use the giveaway service.' },
  IDENTITY_UNRESOLVED: { status: 403, message: 'The account behind this token could not be resolved.' },
  FORBIDDEN: { status: 403, message: 'You do not have permission to perform this action.' },

  // ---- giveaway visibility & lifecycle --------------------------------------
  GIVEAWAY_NOT_FOUND: { status: 404, message: 'Giveaway not found.' },
  GIVEAWAY_NOT_ACTIVE: { status: 409, message: 'This giveaway is not accepting entries right now.' },
  GIVEAWAY_ENDED: { status: 409, message: 'This giveaway has ended.' },
  GIVEAWAY_NOT_STARTED: { status: 409, message: 'This giveaway has not started yet.' },
  ILLEGAL_TRANSITION: { status: 409, message: 'That lifecycle transition is not allowed.' },
  RESULTS_NOT_AVAILABLE: { status: 409, message: 'Results are not available for this giveaway yet.' },
  NO_CURRENT_GIVEAWAY: { status: 404, message: 'No giveaway is currently open.' },
  NO_PREVIOUS_GIVEAWAY: { status: 404, message: 'No giveaway has ended yet.' },
  SLUG_TAKEN: { status: 409, message: 'That giveaway slug is already in use.' },
  POSITION_TAKEN: { status: 409, message: 'Another prize tier already holds that position.' },

  // ---- entry / participation -------------------------------------------------
  ALREADY_JOINED: { status: 409, message: 'You have already entered this giveaway.' },
  PARTICIPATION_NOT_FOUND: { status: 404, message: 'Participation not found.' },
  PARTICIPATION_FINAL: { status: 409, message: 'This participation is already in a terminal state.' },
  ENTRY_LIMIT_REACHED: { status: 409, message: 'The maximum number of entries for this giveaway has been reached.' },
  ENTRY_CURRENCY_NOT_ALLOWED: { status: 422, message: 'That entry currency is not configured for this giveaway.' },
  PRIZE_SELECTION_REQUIRED: { status: 422, message: 'This giveaway has several prize tiers; specify which one to enter.' },
  PRIZE_NOT_AVAILABLE: { status: 404, message: 'Prize not found for this giveaway.' },
  PRIZE_MISMATCH: { status: 422, message: 'The selected prize does not belong to this giveaway.' },
  DEVICE_REFERENCE_REQUIRED: { status: 422, message: 'This giveaway requires a device/session reference.' },
  ELIGIBILITY_REQUIRED: { status: 403, message: 'This account does not meet the eligibility rules of the giveaway.' },
  GEO_VERIFICATION_UNAVAILABLE: { status: 403, message: 'This giveaway is geo-restricted and the country of this request cannot be verified.' },

  // ---- wallet ---------------------------------------------------------------
  INSUFFICIENT_BALANCE: { status: 402, message: 'The wallet balance is too low for this entry.' },
  WALLET_NOT_CONFIGURED: { status: 503, message: 'Wallet integration is not configured.' },
  WALLET_UNREACHABLE: { status: 503, message: 'The wallet provider could not be reached.' },
  ENTRY_CHARGE_FAILED: { status: 502, message: 'The entry fee could not be charged. No entry was recorded.' },
  IDEMPOTENCY_KEY_REQUIRED: { status: 400, message: 'This operation requires an idempotency key.' },
  IDEMPOTENCY_KEY_CONFLICT: { status: 409, message: 'This idempotency key was already used for a different request.' },
  IDEMPOTENCY_IN_PROGRESS: { status: 409, message: 'A request with this idempotency key is still being processed. Retry shortly.' },

  // ---- winners & claims ------------------------------------------------------
  NOT_A_WINNER: { status: 404, message: 'No winning entry was found for this account.' },
  WINNERS_ALREADY_SELECTED: { status: 409, message: 'Winners have already been selected for this prize.' },
  DRAW_WINDOW_OPEN: { status: 409, message: 'Entries are still open; winners can only be drawn after the entry window closes.' },
  WINNER_NOT_FOUND: { status: 404, message: 'Winner not found.' },
  NO_ELIGIBLE_ENTRIES: { status: 409, message: 'There are no eligible entries to draw a winner from.' },
  CLAIM_NOT_FOUND: { status: 404, message: 'Claim not found.' },
  CLAIM_ALREADY_SUBMITTED: { status: 409, message: 'This claim has already been submitted.' },
  CLAIM_EXPIRED: { status: 410, message: 'The claim deadline has passed.' },
  CLAIM_DETAILS_INVALID: { status: 422, message: 'The submitted claim details do not match the required fulfilment type.' },
  CLAIM_WINDOW_UNCONFIGURED: { status: 409, message: 'A claim window must be configured before a winner can be announced.' },

  // ---- fraud review ----------------------------------------------------------
  FRAUD_EVENT_NOT_FOUND: { status: 404, message: 'Fraud event not found.' },
  FRAUD_EVENT_DECIDED: { status: 409, message: 'This fraud event already carries a decision.' },
  // The risk engine REJECTED an entry. The message is deliberately generic: it
  // must not reveal which signal fired or how to evade it, and must not accuse
  // the caller. The corroborating detail lives only on the server-side FraudEvent.
  ENTRY_BLOCKED: { status: 403, message: 'This request could not be completed right now. If you believe this is an error, please contact support.' },

  // ---- operational -----------------------------------------------------------
  DATABASE_UNAVAILABLE: { status: 503, message: 'The database is not reachable right now. Please retry shortly.' },
  // A paid entry in 'dev' wallet mode moves money inside a MongoDB transaction; on
  // a deployment without transaction support it fails CLOSED rather than performing
  // unsafe sequential writes. This is an infrastructure condition, not a user error.
  TRANSACTION_INFRASTRUCTURE_REQUIRED: { status: 503, message: 'Paid entries require a MongoDB deployment that supports transactions (a replica set). Configure one, or use a free-entry draw.' },
});

/**
 * Builds a domain error. `details` may only carry non-sensitive context (limits,
 * dates, identifiers of the caller's OWN resource, the rule name) — never another
 * user's data and never an internal message.
 */
function domain(code, message, details) {
  const spec = CODES[code];
  if (!spec) {
    // A typo must not silently become a 200-shaped mystery error.
    throw new Error(`UNKNOWN_ERROR_CODE: ${code}`);
  }
  return new ApiError(spec.status, code, message || spec.message, details);
}

/** `domain()` with a fixed detail payload (limits, deadlines, allowed values…). */
const withDetails = (code, details) => (message) => domain(code, message, details);

module.exports = { CODES, domain, withDetails };
