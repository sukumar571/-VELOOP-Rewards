/**
 * Reusable Zod primitives shared across request validators.
 *
 * Every enum here is DERIVED from config/constants.js, so adding a lifecycle
 * state or a currency in ONE place cannot leave a validator silently rejecting
 * (or worse, accepting) a value the domain has changed. Query strings arrive as
 * text, so booleans/numbers are coerced explicitly rather than trusted.
 */
const { z } = require('zod');
const mongoose = require('mongoose');
const {
  GIVEAWAY_STATUSES,
  CURRENCIES,
  PARTICIPATION_STATUSES,
  TRANSACTION_STATUSES,
  CLAIM_STATUSES,
  CLAIM_TYPES,
  PRIZE_TYPES,
  WINNER_ANNOUNCEMENT_STATUSES,
  WINNER_VERIFICATION_STATUS,
  FRAUD_EVENT_STATUSES,
  FRAUD_SEVERITIES,
  FRAUD_EVENT_TYPES,
} = require('../config/constants.js');

const objectId = z
  .string()
  .refine((v) => mongoose.Types.ObjectId.isValid(v), { message: 'Invalid identifier.' });

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

/** 'true'/'false' query strings → real booleans (a query value is always text). */
const booleanLike = z.enum(['true', 'false']).transform((v) => v === 'true');

// ---- domain enums (single source of truth) --------------------------------
const giveawayStatus = z.enum(GIVEAWAY_STATUSES);
const currency = z.enum(CURRENCIES);
const participationStatus = z.enum(PARTICIPATION_STATUSES);
const transactionStatus = z.enum(TRANSACTION_STATUSES);
const claimStatus = z.enum(CLAIM_STATUSES);
const claimType = z.enum(CLAIM_TYPES);
const prizeType = z.enum(PRIZE_TYPES);
const announcementStatus = z.enum(WINNER_ANNOUNCEMENT_STATUSES);
const verificationStatus = z.enum(Object.values(WINNER_VERIFICATION_STATUS));
const fraudStatus = z.enum(FRAUD_EVENT_STATUSES);
const fraudSeverity = z.enum(FRAUD_SEVERITIES);
const fraudType = z.enum(FRAUD_EVENT_TYPES);

/** Optional enum filter expressed as a query string. */
const optionalEnum = (schema) => schema.optional().or(z.literal(''));

/**
 * A dotted, allow-listed sort field is unsafe to accept raw, so sorts are always
 * a fixed enum per endpoint — never a free-form string from the client.
 */
const safeIdentifier = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[A-Za-z0-9_-]+$/, 'Must be a simple identifier.');

module.exports = {
  objectId,
  pagination,
  booleanLike,
  safeIdentifier,
  giveawayStatus,
  currency,
  participationStatus,
  transactionStatus,
  claimStatus,
  claimType,
  prizeType,
  announcementStatus,
  verificationStatus,
  fraudStatus,
  fraudSeverity,
  fraudType,
  optionalEnum,
};
