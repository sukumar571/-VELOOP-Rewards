/**
 * Request validators for the admin configuration & lifecycle endpoints.
 *
 * These bodies describe the SAME shape the Giveaway / Prize schemas store, so a
 * mis-typed field is caught at the edge. Every object is `.strict()`: an operator
 * cannot inject `stats`, `statusHistory`, `createdBy`, a second-hand `updatedBy`
 * or any future field simply by naming it — the service allow-lists writes, and
 * this validator refuses unknown keys before they even arrive there.
 */
const { z } = require('zod');
const {
  objectId,
  pagination,
  giveawayStatus,
  currency,
  prizeType,
  claimType,
  participationStatus,
  transactionStatus,
} = require('./common.js');
const { KYC_LEVELS } = require('../config/constants.js');

const idParam = z.object({ id: objectId });
const slugParam = z.object({ slug: z.string().min(3).max(120).regex(/^[a-z0-9](?:[a-z0-9-]{1,118}[a-z0-9])?$/) });
const isoDate = z.union([z.string().datetime(), z.coerce.date()]);

const rulesBlock = z
  .object({
    summary: z.string().trim().max(2000).optional(),
    detailHtml: z.string().max(200000).optional(),
    detailUrl: z.string().url().max(500).optional(),
    version: z.string().trim().max(40).optional(),
  })
  .strict();

const eligibilityBlock = z
  .object({
    countries: z.array(z.string().trim().length(2).toUpperCase()).max(300).optional(),
    excludedCountries: z.array(z.string().trim().length(2).toUpperCase()).max(300).optional(),
    minKycLevel: z.enum(KYC_LEVELS).optional(),
    minAccountAgeDays: z.coerce.number().int().min(0).max(36500).optional(),
    requireVerifiedEmail: z.boolean().optional(),
    blockedUserStatuses: z.array(z.enum(['BLOCKED', 'SUSPENDED'])).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

const participationBlock = z
  .object({
    entryCurrencies: z.array(currency).min(1).max(10).optional(),
    freeEntryCount: z.coerce.number().int().min(0).max(1000).optional(),
    paidEntriesAllowed: z.boolean().optional(),
    maxEntriesPerUser: z.coerce.number().int().min(1).max(100000).optional(),
    maxEntriesPerUserPerDay: z.coerce.number().int().min(1).max(100000).optional(),
    allowMultiplePrizesPerUser: z.boolean().optional(),
    requireDeviceReference: z.boolean().optional(),
    entryCloseGraceSeconds: z.coerce.number().int().min(0).max(86400).optional(),
  })
  .strict();

const prizeConfigBlock = z
  .object({
    drawMethod: z.enum(['RANDOM', 'WEIGHTED_BY_ENTRIES']).optional(),
    claimWindowDays: z.coerce.number().int().min(1).max(365).optional(),
    allowDuplicateWinners: z.boolean().optional(),
    announcePublicly: z.boolean().optional(),
    hideLosingParticipants: z.boolean().optional(),
  })
  .strict();

// Shared giveaway configuration fields (create + update reuse them).
const giveawayConfigFields = {
  title: z.string().trim().min(1).max(200),
  tagline: z.string().trim().max(300).optional(),
  description: z.string().trim().max(20000).optional(),
  descriptionHtml: z.string().max(200000).optional(),
  images: z.array(z.string().url().max(500)).max(50).optional(),
  icon: z.string().trim().max(120).optional(),
  accent: z.string().trim().max(40).optional(),
  featured: z.boolean().optional(),
  termsVersion: z.string().trim().max(40).optional(),
  rules: rulesBlock.optional(),
  eligibility: eligibilityBlock.optional(),
  participation: participationBlock.optional(),
  prizeConfig: prizeConfigBlock.optional(),
  startAt: isoDate.optional(),
  endAt: isoDate.optional(),
};

/** POST /admin/giveaways — a new draw (defaults to UPCOMING, unpublished). */
const createGiveawayBody = z
  .object({
    ...giveawayConfigFields,
    title: z.string().trim().min(1).max(200),
    slug: z.string().trim().min(3).max(120).regex(/^[a-z0-9](?:[a-z0-9-]{1,118}[a-z0-9])?$/),
    startAt: isoDate,
    endAt: isoDate,
    status: giveawayStatus.optional(),
    published: z.boolean().optional(),
  })
  .strict();

/** PATCH /admin/giveaways/:id — slug & status are refused by the service, not here. */
const updateGiveawayBody = z
  .object({
    ...giveawayConfigFields,
    title: z.string().trim().min(1).max(200).optional(),
    published: z.boolean().optional(),
  })
  .strict();

/** POST /admin/giveaways/:id/publish */
const publishBody = z
  .object({ published: z.boolean(), reason: z.string().trim().max(500).optional() })
  .strict();

/** POST /admin/giveaways/:id/transition */
const transitionBody = z
  .object({ status: giveawayStatus, reason: z.string().trim().max(500).optional() })
  .strict();

// ---- prizes ---------------------------------------------------------------
const feeOverride = z.object({ currency, amount: z.coerce.number().min(0).max(100000000) }).strict();
const claimDigitalConfig = z
  .object({ channel: z.enum(['IN_APP', 'EMAIL', 'SMS']).optional(), templateKey: z.string().trim().max(120).optional() })
  .strict(); // NOTE: codePoolId is write-only config; never accepted over HTTP.
const claimPhysicalConfig = z
  .object({
    shipToCountries: z.array(z.string().trim().length(2).toUpperCase()).max(300).optional(),
    requirePhone: z.boolean().optional(),
    requirePostalCode: z.boolean().optional(),
    collectTaxId: z.boolean().optional(),
  })
  .strict();
const claimConfig = z
  .object({
    windowDays: z.coerce.number().int().min(1).max(365).optional(),
    requireKyc: z.boolean().optional(),
    instructions: z.string().trim().max(2000).optional(),
    physical: claimPhysicalConfig.optional(),
    digital: claimDigitalConfig.optional(),
  })
  .strict();

const prizeFields = {
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(8000).optional(),
  imageRef: z.string().trim().max(300).optional(),
  gallery: z.array(z.string().trim().max(300)).max(50).optional(),
  position: z.coerce.number().int().min(1).max(1000),
  winnerCount: z.coerce.number().int().min(1).max(100000),
  prizeType,
  claimType: claimType.optional(),
  entryCurrency: currency,
  entryAmount: z.coerce.number().min(0).max(100000000),
  feeOverrides: z.array(feeOverride).max(10).optional(),
  maxEntries: z.coerce.number().int().min(1).max(1000000).optional(),
  claim: claimConfig.optional(),
  active: z.boolean().optional(),
};

const createPrizeBody = z.object(prizeFields).strict();
// Every create field becomes optional on update (wrapping an already-optional
// schema in `.optional()` is a harmless no-op in Zod).
const updatePrizeBody = z
  .object(Object.fromEntries(Object.entries(prizeFields).map(([k, v]) => [k, v.optional()])))
  .strict();

// ---- read filters ---------------------------------------------------------
const participationsQuery = z.object({ giveawayId: objectId.optional(), status: participationStatus.optional(), ...pagination });
const ledgerQuery = z.object({ giveawayId: objectId.optional(), status: transactionStatus.optional(), ...pagination });

/** POST /admin/participations/:id/void — void or disqualify, optionally refunding. */
const voidBody = z
  .object({
    mode: z.enum(['VOIDED_FRAUD', 'DISQUALIFIED']),
    reason: z.string().trim().min(3).max(500),
    refund: z.boolean().default(false),
  })
  .strict();

module.exports = {
  idParam,
  slugParam,
  createGiveawayBody,
  updateGiveawayBody,
  publishBody,
  transitionBody,
  createPrizeBody,
  updatePrizeBody,
  participationsQuery,
  ledgerQuery,
  voidBody,
};
