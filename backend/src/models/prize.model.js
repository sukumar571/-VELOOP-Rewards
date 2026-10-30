/**
 * Prize (a.k.a. GiveawayPrize) — one prize tier inside a giveaway.
 *
 * Spec coverage: stable ID, giveaway association, name, description, image
 * reference, position, winnerCount, prizeType (PHYSICAL | GIFT_CARD | DIGITAL),
 * claimType, entryCurrency, entryAmount, claim configuration.
 *
 * The fee lives HERE as data (`entryCurrency` / `entryAmount` / `feeOverrides`),
 * so entry-pricing decisions never become `if`-branches in controllers, and the
 * claim behaviour lives in `claim` — the claim service reads config, not names.
 */
const mongoose = require('mongoose');
const { jsonOptions, objectOptions, blockDelete, withSeedMarker } = require('../utils/schema.js');
const {
  PRIZE_TYPES,
  PRIZE_TYPE,
  CLAIM_TYPES,
  CLAIM_TYPE,
  PRIZE_TYPE_DEFAULT_CLAIM_TYPE,
  CURRENCIES,
} = require('../config/constants.js');

/** Per-currency override of the prize's default entry fee. */
const feeOverrideSchema = new mongoose.Schema(
  {
    currency: { type: String, enum: CURRENCIES, required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const physicalClaimConfig = {
  /** Countries the prize ships to; empty = follow the giveaway's eligibility. */
  shipToCountries: { type: [String], default: [] },
  requirePhone: { type: Boolean, default: true },
  requirePostalCode: { type: Boolean, default: true },
  collectTaxId: { type: Boolean, default: false },
};

const digitalClaimConfig = {
  /** Where a code/voucher is delivered. The value itself is never stored here. */
  channel: { type: String, enum: ['IN_APP', 'EMAIL', 'SMS'], default: 'IN_APP' },
  templateKey: { type: String, trim: true },
  /** Codes are held in their own collection/vault, referenced by ID only. */
  codePoolId: { type: String, trim: true },
};

const claimSchema = new mongoose.Schema(
  {
    /** Days after announcement to submit the claim. Value is [PDF] — never defaulted. */
    windowDays: { type: Number, min: 1 },
    /** Whether KYC must be verified before fulfilment. Policy is [PDF]. */
    requireKyc: { type: Boolean, default: false },
    instructions: { type: String, trim: true, maxlength: 2000 },
    physical: physicalClaimConfig,
    digital: digitalClaimConfig,
  },
  { _id: false },
);

const prizeSchema = new mongoose.Schema(
  {
    giveawayId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Giveaway',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 8000 },
    imageRef: { type: String, trim: true }, // CDN key / asset id — never binary
    gallery: { type: [String], default: [] },

    /** Display + draw order inside the giveaway; unique per giveaway. */
    position: { type: Number, required: true, min: 1 },
    winnerCount: { type: Number, required: true, min: 1, default: 1 },

    prizeType: { type: String, enum: PRIZE_TYPES, required: true },
    claimType: { type: String, enum: CLAIM_TYPES, required: true },

    // ----- fee configuration (data, not code) --------------------------------
    entryCurrency: { type: String, enum: CURRENCIES, required: true },
    entryAmount: { type: Number, required: true, min: 0 },
    feeOverrides: { type: [feeOverrideSchema], default: [] },
    /** Cap on paid entries for this tier; the per-user cap lives on Giveaway. */
    maxEntries: { type: Number, min: 1 },

    claim: { type: claimSchema, default: () => ({}) },

    active: { type: Boolean, default: true, index: true },
    removedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: jsonOptions({ privatePaths: ['claim.digital.codePoolId'] }),
    toObject: objectOptions(),
  },
);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
prizeSchema.pre('validate', function defaultClaimType(next) {
  // claimType is derived from prizeType only when the operator left it unset,
  // so the mapping is a documented default rather than a hidden rule.
  if (!this.claimType && this.prizeType) {
    this.claimType = PRIZE_TYPE_DEFAULT_CLAIM_TYPE[this.prizeType] || CLAIM_TYPE.FORM;
  }
  next();
});

prizeSchema.pre('validate', function validateTypeConsistency(next) {
  if (this.prizeType === PRIZE_TYPE.PHYSICAL && this.claimType === CLAIM_TYPE.AUTOMATIC) {
    this.invalidate('claimType', 'A PHYSICAL prize requires winner-supplied fulfilment details.');
  }
  if (
    this.prizeType !== PRIZE_TYPE.PHYSICAL &&
    this.claimType === CLAIM_TYPE.FORM &&
    !this.claim?.digital?.channel
  ) {
    // FORM for a non-physical prize still needs to say where it goes.
    this.invalidate('claim.digital.channel', 'Non-physical FORM claims need a delivery channel.');
  }
  if (this.entryCurrency && Array.isArray(this.feeOverrides)) {
    const dup = this.feeOverrides.filter((f) => f.currency === this.entryCurrency);
    if (dup.length) this.invalidate('feeOverrides', 'Do not override the default entry currency; change entryAmount instead.');
  }
  next();
});

/**
 * Pure policy check used by the admin write path before a prize is accepted:
 * the prize must be priced in a currency the giveaway actually enables.
 * Kept DB-free so it is unit-testable without MongoDB.
 */
prizeSchema.statics.assertMatchesGiveaway = function assertMatchesGiveaway(giveaway, prizeLike) {
  const allowed = (giveaway.participation && giveaway.participation.entryCurrencies) || [];
  const currencies = [prizeLike.entryCurrency, ...(prizeLike.feeOverrides || []).map((f) => f.currency)];
  const bad = currencies.filter((c) => !allowed.includes(c));
  if (bad.length) {
    const err = new Error(`PRIZE_FEE_POLICY: currencies [${bad.join(', ')}] are not enabled on this giveaway.`);
    err.code = 'PRIZE_FEE_POLICY';
    throw err;
  }
  return true;
};

/**
 * Resolves the entry fee a participant would be charged, purely from
 * configuration: the tier's own currency/amount, or the matching entry in
 * `feeOverrides`. Nothing in the entry path needs an `if (currency === 'VE')`.
 * DB-free, so it is unit-testable without MongoDB.
 *
 * @returns {{currency: string, amount: number, source: 'base'|'override'}}
 * @throws {Error} `code: 'ENTRY_CURRENCY_NOT_ALLOWED'` when the tier has no such price
 */
prizeSchema.statics.resolveFee = function resolveFee(prize, currency) {
  const want = currency || prize.entryCurrency;
  if (want === prize.entryCurrency) {
    return { currency: want, amount: prize.entryAmount, source: 'base' };
  }
  const override = (prize.feeOverrides || []).find((f) => f.currency === want);
  if (!override) {
    const err = new Error(`ENTRY_CURRENCY_NOT_ALLOWED: prize "${prize.name}" has no fee configured for ${want}.`);
    err.code = 'ENTRY_CURRENCY_NOT_ALLOWED';
    err.currency = want;
    throw err;
  }
  return { currency: want, amount: override.amount, source: 'override' };
};

/** Total winner slots across the active prizes of a giveaway. */
prizeSchema.statics.sumWinnerCounts = function sumWinnerCounts(prizes) {
  return prizes.reduce((sum, p) => sum + (p.winnerCount || 0), 0);
};

// ---------------------------------------------------------------------------
// Deletion policy: a prize that has produced winners/claims is history.
// ---------------------------------------------------------------------------
blockDelete(prizeSchema, { label: 'prize' });

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
prizeSchema.index({ giveawayId: 1, position: 1 }, { unique: true });
prizeSchema.index({ giveawayId: 1, active: 1 });
prizeSchema.index({ prizeType: 1 });

/** Written by the dev seed only; null on every real record. */
withSeedMarker(prizeSchema);

module.exports = mongoose.model('Prize', prizeSchema);
