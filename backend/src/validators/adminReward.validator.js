/**
 * Validators for the admin reward console. Amounts and currencies are required on
 * creation (an administrator sets them), and are never accepted from a member.
 */
const { z } = require('zod');
const {
  CURRENCIES,
  ACTIVITY_CLAIM_MODES,
  REWARD_DIRECTIONS,
  REWARD_TRANSACTION_TYPES,
  REFERRAL_STATUSES,
} = require('../config/constants.js');
const { objectId, pagination } = require('./common.js');

const dateOrNull = z.union([z.coerce.date(), z.null()]);

const eligibilityBody = z
  .object({
    minAccountAgeHours: z.number().min(0).max(8760).optional(),
    requireParticipation: z.boolean().optional(),
    kycStatus: z.enum(['ANY', 'VERIFIED']).optional(),
  })
  .strict();

const activityBody = z
  .object({
    key: z.string().trim().toLowerCase().min(2).max(60).regex(/^[a-z0-9][a-z0-9-]*$/, 'Use lowercase letters, digits and dashes.'),
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().max(400).optional(),
    currency: z.enum(CURRENCIES),
    amount: z.number().int().min(1).max(1_000_000),
    claimMode: z.enum(ACTIVITY_CLAIM_MODES).default('ONCE'),
    cooldownHours: z.number().int().min(1).max(720).optional(),
    maxClaimsPerUser: z.number().int().min(1).max(10000).default(1),
    startsAt: dateOrNull.optional(),
    endsAt: dateOrNull.optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
    eligibility: eligibilityBody.optional(),
  })
  .strict();

const activityUpdateBody = activityBody.partial().strict();

const codeBody = z
  .object({
    code: z.string().trim().toUpperCase().min(3).max(40).regex(/^[A-Z0-9_-]+$/, 'Use letters, digits, dashes or underscores.'),
    label: z.string().trim().max(120).optional(),
    currency: z.enum(CURRENCIES),
    amount: z.number().int().min(1).max(1_000_000),
    active: z.boolean().optional(),
    startsAt: dateOrNull.optional(),
    expiresAt: dateOrNull.optional(),
    maxRedemptions: z.union([z.number().int().min(1).max(1_000_000), z.null()]).optional(),
    perUserLimit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

const codeUpdateBody = codeBody.partial().extend({ code: z.string().optional() }).strict();

const generateBody = z
  .object({
    count: z.number().int().min(1).max(50),
    currency: z.enum(CURRENCIES),
    amount: z.number().int().min(1).max(1_000_000),
    label: z.string().trim().max(120).optional(),
    prefix: z.string().trim().max(8).optional(),
    maxRedemptions: z.union([z.number().int().min(1).max(1_000_000), z.null()]).optional(),
    perUserLimit: z.number().int().min(1).max(100).optional(),
    expiresAt: dateOrNull.optional(),
  })
  .strict();

const referralConfigBody = z
  .object({
    enabled: z.boolean(),
    referrerReward: z
      .object({ currency: z.enum(CURRENCIES), amount: z.number().int().min(1).max(1_000_000) })
      .strict(),
    refereeReward: z
      .union([
        z.object({ currency: z.enum(CURRENCIES), amount: z.number().int().min(1).max(1_000_000) }).strict(),
        z.null(),
      ])
      .optional(),
    qualification: z
      .object({
        minAccountAgeHours: z.number().min(0).max(8760),
        requireParticipation: z.boolean(),
        autoApprove: z.boolean(),
      })
      .strict(),
    maxReferralsPerUser: z.number().int().min(1).max(10000),
  })
  .strict();

const reviewReferralBody = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

const adjustBody = z
  .object({
    currency: z.enum(CURRENCIES),
    amount: z.number().int().min(1).max(1_000_000),
    direction: z.enum(REWARD_DIRECTIONS),
    reason: z.string().trim().min(3).max(300),
  })
  .strict();

const idParam = z.object({ id: objectId }).strict();
const walletParams = z.object({ userId: objectId }).strict();

const listQuery = z
  .object({
    ...pagination,
    status: z.enum(REFERRAL_STATUSES).optional(),
    code: z.string().trim().max(40).optional(),
    userId: objectId.optional(),
    type: z.enum(REWARD_TRANSACTION_TYPES).optional(),
    currency: z.enum(CURRENCIES).optional(),
  })
  .strict();

module.exports = {
  activityBody,
  activityUpdateBody,
  codeBody,
  codeUpdateBody,
  generateBody,
  referralConfigBody,
  reviewReferralBody,
  adjustBody,
  idParam,
  walletParams,
  listQuery,
};
