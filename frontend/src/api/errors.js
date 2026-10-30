/**
 * ============================================================================
 * SERVICE ERRORS — one error type the UI already understands.
 * ============================================================================
 * Components branch on a stable, short `code` (NOT_AUTHENTICATED,
 * INSUFFICIENT_BALANCE, ALREADY_JOINED, FORBIDDEN, EXPIRED, VALIDATION,
 * NOT_FOUND, ...). The API speaks the backend's domain codes; this maps them
 * WITHOUT ever forwarding an internal message detail or the raw token. `VALIDATION`
 * errors carry a `.fields` map so forms can highlight inputs.
 * ========================================================================= */

export class ServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
  }
}

// Backend domain code  ->  the UI's stable code.
const GENERIC_MAP = {
  LOGIN_REQUIRED: 'NOT_AUTHENTICATED',
  TOKEN_EXPIRED: 'NOT_AUTHENTICATED',
  INVALID_TOKEN: 'NOT_AUTHENTICATED',
  UNAUTHORIZED: 'NOT_AUTHENTICATED',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  ENTRY_CHARGE_FAILED: 'JOIN_FAILED',
  ALREADY_JOINED: 'ALREADY_JOINED',
  DUPLICATE_KEY: 'ALREADY_JOINED',
  IDEMPOTENCY_IN_PROGRESS: 'ALREADY_JOINED',
  GIVEAWAY_ENDED: 'ENDED',
  ENDED: 'ENDED',
  DRAW_WINDOW_OPEN: 'ENDED',
  GIVEAWAY_NOT_FOUND: 'NOT_FOUND',
  NO_CURRENT_GIVEAWAY: 'NOT_FOUND',
  PRIZE_NOT_AVAILABLE: 'NOT_FOUND',
  PRIZE_SELECTION_REQUIRED: 'PRIZE_SELECTION_REQUIRED',
  ENTRY_CURRENCY_NOT_ALLOWED: 'VALIDATION',
  ENTRY_LIMIT_REACHED: 'ENTRY_LIMIT_REACHED',
  ENTRY_BLOCKED: 'FORBIDDEN',
  FORBIDDEN: 'FORBIDDEN',
  ACCOUNT_NOT_ACTIVE: 'FORBIDDEN',
  IDENTITY_UNRESOLVED: 'FORBIDDEN',
  ELIGIBILITY_REQUIRED: 'INELIGIBLE',
  RATE_LIMITED: 'RATE_LIMITED',
  WALLET_NOT_CONFIGURED: 'WALLET_UNAVAILABLE',
  WALLET_UNAVAILABLE: 'WALLET_UNAVAILABLE',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  VALIDATION_ERROR: 'VALIDATION',
};

// Claim surface overrides: a 404 on someone else's claim is "forbidden", not
// "not found" — but the message must never reveal that the claim exists.
const CLAIM_MAP = {
  CLAIM_NOT_FOUND: 'FORBIDDEN',
  CLAIM_EXPIRED: 'EXPIRED',
  CLAIM_ALREADY_SUBMITTED: 'ALREADY_SUBMITTED',
  CLAIM_DETAILS_INVALID: 'VALIDATION',
};

/**
 * Convert an ApiClientError (or any thrown value) into a ServiceError.
 * @param {Error} err
 * @param {{claim?: boolean}} opts.claim use the claim-aware code map.
 */
export function toServiceError(err, { claim = false } = {}) {
  const rawCode = err?.code || 'NETWORK_ERROR';
  const map = claim ? { ...GENERIC_MAP, ...CLAIM_MAP } : GENERIC_MAP;
  const code = map[rawCode] || (err?.status === 0 ? 'NETWORK_ERROR' : 'SERVICE_ERROR');
  const se = new ServiceError(code, safeMessage(err, code));
  if (code === 'VALIDATION') se.fields = fieldErrors(err?.details, claim);
  return se;
}

function safeMessage(err, code) {
  // Only ever forward a short, server-provided message; never internals.
  const msg = typeof err?.message === 'string' ? err.message.trim() : '';
  if (msg && err?.status && err.status < 500) return msg;
  return FALLBACK[code] || 'Something went wrong. Please try again.';
}

const FALLBACK = {
  NOT_AUTHENTICATED: 'Please sign in to continue.',
  INSUFFICIENT_BALANCE: 'Your balance does not cover this entry fee.',
  ALREADY_JOINED: "You've already entered this giveaway.",
  ENDED: 'The entry window for this giveaway has closed.',
  FORBIDDEN: "You're not authorized to perform this action.",
  INELIGIBLE: "This account isn't eligible to enter this giveaway.",
  EXPIRED: 'The claim deadline for this prize has passed.',
  ALREADY_SUBMITTED: 'Your claim has already been submitted.',
  VALIDATION: 'Please correct the highlighted fields.',
  NOT_FOUND: 'We could not find what you were looking for.',
  RATE_LIMITED: 'Too many attempts — please wait a moment and try again.',
  WALLET_UNAVAILABLE: 'Your wallet balance could not be verified right now.',
  SERVICE_UNAVAILABLE: 'The service is temporarily unavailable. Please retry shortly.',
  NETWORK_ERROR: 'We could not reach the service. Please check your connection.',
  PRIZE_SELECTION_REQUIRED: 'Please choose a prize tier to enter.',
};

// Turn { missing: ['fullName', ...] } into per-field messages for the form.
function fieldErrors(details, claim) {
  if (!details) return undefined;
  const out = {};
  const missing = Array.isArray(details.missing) ? details.missing : [];
  for (const key of missing) out[claim ? fieldToInput(key) : key] = 'Required.';
  if (!claim && details.fields && typeof details.fields === 'object') {
    Object.assign(out, details.fields);
  }
  return Object.keys(out).length ? out : undefined;
}

// Backend physical key -> the form input name (postalCode lives as `pin`).
function fieldToInput(key) {
  return key === 'postalCode' ? 'pin' : key;
}
