/**
 * ============================================================================
 * DOMAIN CONSTANTS — the single source of truth for every enum used by models,
 * validators, services and seed scripts.
 * ============================================================================
 * Values here come from the VELOOP Rewards Giveaway specification the OWNER
 * provided (lifecycle states, prize types, transaction states). Anything the
 * spec has not fixed is explicitly tagged [ASSUMPTION] and must be confirmed
 * against the 88-page project PDF before the business rules are enforced.
 *
 * Fees/limits deliberately have NO values in this file: they live in giveaway /
 * prize *configuration documents* (see Giveaway.participation and Prize.fees) so
 * that no controller ever needs a scattered `if (prizeName === ...)` branch.
 * ========================================================================= */

/** Reward currencies supported for entry fees (spec A2.1). */
const CURRENCY = Object.freeze({ VE: 'VE', SVE: 'SVE', TOKEN: 'TOKEN' });
const CURRENCIES = Object.freeze(Object.values(CURRENCY));

/**
 * Giveaway lifecycle — the four states defined by the specification.
 * History is never destroyed: ENDED → ARCHIVED is the only "retirement" path and
 * ARCHIVED documents are retained (hard deletes are blocked in the model).
 */
const GIVEAWAY_STATUS = Object.freeze({
  UPCOMING: 'UPCOMING',
  ACTIVE: 'ACTIVE',
  ENDED: 'ENDED',
  ARCHIVED: 'ARCHIVED',
});
const GIVEAWAY_STATUSES = Object.freeze(Object.values(GIVEAWAY_STATUS));

/** States in which a user may start a new participation (entry window open). */
const ENTRY_OPEN_GIVEAWAY_STATUSES = Object.freeze([GIVEAWAY_STATUS.ACTIVE]);

/** States in which results/winner/claim data may be surfaced publicly. */
const RESULT_PUBLISHED_GIVEAWAY_STATUSES = Object.freeze([
  GIVEAWAY_STATUS.ENDED,
  GIVEAWAY_STATUS.ARCHIVED,
]);

/** Documented forward-only lifecycle transitions, enforced by the model hook. */
const GIVEAWAY_STATUS_TRANSITIONS = Object.freeze({
  UPCOMING: [GIVEAWAY_STATUS.ACTIVE, GIVEAWAY_STATUS.ARCHIVED],
  ACTIVE: [GIVEAWAY_STATUS.ENDED],
  ENDED: [GIVEAWAY_STATUS.ARCHIVED],
  ARCHIVED: [],
});

/** Prize fulfilment families (spec). */
const PRIZE_TYPE = Object.freeze({
  PHYSICAL: 'PHYSICAL',
  GIFT_CARD: 'GIFT_CARD',
  DIGITAL: 'DIGITAL',
});
const PRIZE_TYPES = Object.freeze(Object.values(PRIZE_TYPE));

/**
 * How a winner must act to receive a prize (spec: "claimType" + claim config).
 * [ASSUMPTION on naming] — the spec fixes that a claim type exists and drives the
 * required fulfilment fields; the exact labels below map 1:1 to the fulfilment
 * shapes the frontend claim flow already renders (shipping form vs. email).
 */
const CLAIM_TYPE = Object.freeze({
  /** Winner submits fulfilment details (physical shipping contact). */
  FORM: 'FORM',
  /** Winner supplies/confirmes a delivery channel (gift-card email or account). */
  DIGITAL_DELIVERY: 'DIGITAL_DELIVERY',
  /** No winner action; issued automatically by an operator. */
  AUTOMATIC: 'AUTOMATIC',
});
const CLAIM_TYPES = Object.freeze(Object.values(CLAIM_TYPE));

/** Default claim type per prize type — configuration, not controller branches. */
const PRIZE_TYPE_DEFAULT_CLAIM_TYPE = Object.freeze({
  [PRIZE_TYPE.PHYSICAL]: CLAIM_TYPE.FORM,
  [PRIZE_TYPE.GIFT_CARD]: CLAIM_TYPE.DIGITAL_DELIVERY,
  [PRIZE_TYPE.DIGITAL]: CLAIM_TYPE.DIGITAL_DELIVERY,
});

/** Which fulfilment sub-document each claim type requires (validated in-model). */
const CLAIM_TYPE_FULFILMENT_SHAPE = Object.freeze({
  [CLAIM_TYPE.FORM]: 'physical',
  [CLAIM_TYPE.DIGITAL_DELIVERY]: 'digital',
  [CLAIM_TYPE.AUTOMATIC]: 'none',
});

/**
 * Participation row state. One row per user per event (DB-unique); the status
 * explains what happened to that participation, never a second row.
 * [ASSUMPTION] exact labels pending PDF refund/disqualification rules.
 */
const PARTICIPATION_STATUS = Object.freeze({
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  REFUNDED: 'REFUNDED',
  DISQUALIFIED: 'DISQUALIFIED',
  VOIDED_FRAUD: 'VOIDED_FRAUD',
});
const PARTICIPATION_STATUSES = Object.freeze(Object.values(PARTICIPATION_STATUS));

/** Entry-fee transaction ledger (append-only). */
const TRANSACTION_TYPE = Object.freeze({
  ENTRY_FEE: 'ENTRY_FEE',
  REFUND: 'REFUND',
  REVERSAL: 'REVERSAL',
  ADJUSTMENT: 'ADJUSTMENT',
});
const TRANSACTION_TYPES = Object.freeze(Object.values(TRANSACTION_TYPE));

const TRANSACTION_STATUS = Object.freeze({
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  REVERSED: 'REVERSED',
});
const TRANSACTION_STATUSES = Object.freeze(Object.values(TRANSACTION_STATUS));

/** Terminal states may never be overwritten — reversal creates a new row. */
const TRANSACTION_TERMINAL_STATUSES = Object.freeze([
  TRANSACTION_STATUS.SUCCESS,
  TRANSACTION_STATUS.REVERSED,
]);

/**
 * KYC levels an eligibility rule can require, in increasing order of evidence.
 * `minKycLevel` on a giveaway compares against this order.
 */
const KYC_LEVEL = Object.freeze({ NONE: 'NONE', BASIC: 'BASIC', FULL: 'FULL' });
const KYC_LEVELS = Object.freeze(Object.values(KYC_LEVEL));

const USER_STATUS = Object.freeze({ ACTIVE: 'ACTIVE', BLOCKED: 'BLOCKED', SUSPENDED: 'SUSPENDED' });
const USER_STATUSES = Object.freeze(Object.values(USER_STATUS));

const ROLE = Object.freeze({ USER: 'user', ADMIN: 'admin' });

const WINNER_ANNOUNCEMENT_STATUS = Object.freeze({
  HOLD: 'HOLD',
  PRIVATE_NOTIFIED: 'PRIVATE_NOTIFIED',
  ANNOUNCED: 'ANNOUNCED',
});
const WINNER_ANNOUNCEMENT_STATUSES = Object.freeze(Object.values(WINNER_ANNOUNCEMENT_STATUS));

const WINNER_VERIFICATION_STATUS = Object.freeze({
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  DISQUALIFIED: 'DISQUALIFIED',
});

// Claim statuses — the documented API enum contract shared with the frontend
// (frontend/src/config/claimStatus.js). Keep these five values in sync.
const CLAIM_STATUS = Object.freeze({
  NOT_SUBMITTED: 'NOT_SUBMITTED',
  SUBMITTED: 'SUBMITTED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
});
const CLAIM_STATUSES = Object.freeze(Object.values(CLAIM_STATUS));

/** Anti-fraud signals. Deliberately no raw device/IP payloads — hashes only. */
const FRAUD_EVENT_TYPE = Object.freeze({
  DUPLICATE_ATTEMPT: 'DUPLICATE_ATTEMPT',
  DEVICE_VELOCITY: 'DEVICE_VELOCITY',
  IP_VELOCITY: 'IP_VELOCITY',
  BOT_PATTERN: 'BOT_PATTERN',
  IDENTITY_MISMATCH: 'IDENTITY_MISMATCH',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
  // Added by the risk engine: corroborating signals that, unlike a lone
  // device/IP hit, can combine with another category to justify a REJECT.
  REPEATED_FAILURE: 'REPEATED_FAILURE',
  PARTICIPATION_VELOCITY: 'PARTICIPATION_VELOCITY',
  ACCOUNT_AGE: 'ACCOUNT_AGE',
});
const FRAUD_EVENT_TYPES = Object.freeze(Object.values(FRAUD_EVENT_TYPE));

/**
 * Risk-decision outcomes produced by the fraud engine. These are internal
 * control states, never surfaced verbatim to a public caller (REJECT maps to a
 * single generic 403 code so the detection logic is not disclosed).
 */
const RISK_DECISION = Object.freeze({
  ALLOW: 'ALLOW',
  FLAG_FOR_REVIEW: 'FLAG_FOR_REVIEW',
  REJECT: 'REJECT',
});
const RISK_DECISIONS = Object.freeze(Object.values(RISK_DECISION));

/**
 * Signal categories that are NEVER conclusive on their own. A shared device or a
 * shared IP has legitimate explanations (family Wi-Fi, corporate NAT, a mobile
 * carrier's few egress addresses), so these can only FLAG unless corroborated by
 * a distinct, non-velocity category crossing its own threshold.
 */
const VELOCITY_FRAUD_TYPES = Object.freeze([FRAUD_EVENT_TYPE.DEVICE_VELOCITY, FRAUD_EVENT_TYPE.IP_VELOCITY]);

const FRAUD_SEVERITY = Object.freeze({ LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' });
const FRAUD_SEVERITIES = Object.freeze(Object.values(FRAUD_SEVERITY));

const FRAUD_EVENT_STATUS = Object.freeze({
  OPEN: 'OPEN',
  UNDER_REVIEW: 'UNDER_REVIEW',
  DISMISSED: 'DISMISSED',
  CONFIRMED: 'CONFIRMED',
});
const FRAUD_EVENT_STATUSES = Object.freeze(Object.values(FRAUD_EVENT_STATUS));

/** Where a cached balance snapshot came from — NEVER a substitute for the API. */
const WALLET_SOURCE = Object.freeze({ VELOOP_API: 'VELOOP_API', MANUAL: 'MANUAL', SEED_FIXTURE: 'SEED_FIXTURE' });

/** Marker written by the dev seed so reset can remove exactly those documents. */
const SEED_MARKER = Object.freeze({ key: 'seedBatch', value: 'dev-fixture-v2' });

module.exports = {
  CURRENCY,
  CURRENCIES,
  GIVEAWAY_STATUS,
  GIVEAWAY_STATUSES,
  GIVEAWAY_STATUS_TRANSITIONS,
  ENTRY_OPEN_GIVEAWAY_STATUSES,
  RESULT_PUBLISHED_GIVEAWAY_STATUSES,
  PRIZE_TYPE,
  PRIZE_TYPES,
  CLAIM_TYPE,
  CLAIM_TYPES,
  PRIZE_TYPE_DEFAULT_CLAIM_TYPE,
  CLAIM_TYPE_FULFILMENT_SHAPE,
  PARTICIPATION_STATUS,
  PARTICIPATION_STATUSES,
  TRANSACTION_TYPE,
  TRANSACTION_TYPES,
  TRANSACTION_STATUS,
  TRANSACTION_STATUSES,
  TRANSACTION_TERMINAL_STATUSES,
  USER_STATUS,
  USER_STATUSES,
  KYC_LEVEL,
  KYC_LEVELS,
  ROLE,
  WINNER_ANNOUNCEMENT_STATUS,
  WINNER_ANNOUNCEMENT_STATUSES,
  WINNER_VERIFICATION_STATUS,
  CLAIM_STATUS,
  CLAIM_STATUSES,
  FRAUD_EVENT_TYPE,
  FRAUD_EVENT_TYPES,
  RISK_DECISION,
  RISK_DECISIONS,
  VELOCITY_FRAUD_TYPES,
  FRAUD_SEVERITY,
  FRAUD_SEVERITIES,
  FRAUD_EVENT_STATUS,
  FRAUD_EVENT_STATUSES,
  WALLET_SOURCE,
  SEED_MARKER,
};
