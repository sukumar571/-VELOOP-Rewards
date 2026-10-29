/**
 * Giveaway — one giveaway event (the aggregate root).
 *
 * Spec coverage: stable ID, title, slug, description, rules, eligibility,
 * startAt, endAt, lifecycle status (UPCOMING | ACTIVE | ENDED | ARCHIVED),
 * prize configuration, participation settings and timestamps.
 *
 * Design rules that matter:
 *  - `_id` is the stable ID and is exposed as `id`; `slug` is the stable human
 *    key and is immutable once the draw has been published.
 *  - Fees and limits are DATA (`participation` here + `Prize.fees`), never
 *    `if`-branches in controllers.
 *  - History is preserved: a draw that has collected participation can never be
 *    hard-deleted (see the delete guard); retirement is ENDED → ARCHIVED.
 */
const mongoose = require('mongoose');
const { jsonOptions, objectOptions, blockDelete, withSeedMarker } = require('../utils/schema.js');
const {
  GIVEAWAY_STATUSES,
  GIVEAWAY_STATUS,
  GIVEAWAY_STATUS_TRANSITIONS,
  ENTRY_OPEN_GIVEAWAY_STATUSES,
  CURRENCIES,
  CURRENCY,
} = require('../config/constants.js');

/** Public rules text — stored as markup + an optional canonical URL. */
const rulesSchema = new mongoose.Schema(
  {
    summary: { type: String, trim: true, maxlength: 2000 },
    detailHtml: { type: String },
    detailUrl: { type: String, trim: true },
    version: { type: String, trim: true, default: 'v1' }, // rules shown to entrants are versioned
  },
  { _id: false },
);

/**
 * Eligibility criteria. Each rule is a declarative filter the future entry
 * service evaluates; the exact policy set is [PDF], so nothing here defaults to
 * a restrictive value that would silently exclude users.
 */
const eligibilitySchema = new mongoose.Schema(
  {
    countries: { type: [String], default: [] }, // empty = not geo-restricted
    excludedCountries: { type: [String], default: [] },
    minKycLevel: { type: String, enum: ['NONE', 'BASIC', 'FULL'], default: 'NONE' },
    minAccountAgeDays: { type: Number, min: 0, default: 0 },
    requireVerifiedEmail: { type: Boolean, default: false },
    blockedUserStatuses: {
      type: [String],
      enum: ['BLOCKED', 'SUSPENDED'],
      default: ['BLOCKED', 'SUSPENDED'],
    },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false },
);

/** Participation settings — the fee/limit policy for this event (spec: "fees in configuration"). */
const participationSchema = new mongoose.Schema(
  {
    /** Currencies a user may pay entry fees in (spec A2.1: VE / SVE / TOKEN). */
    entryCurrencies: {
      type: [String],
      enum: CURRENCIES,
      default: [CURRENCY.VE],
      validate: [(arr) => arr.length > 0, 'At least one entry currency must be configured.'],
    },
    /** Entries granted for free before paid entries apply. */
    freeEntryCount: { type: Number, min: 0, default: 0 },
    /** Extra entries beyond the free allowance; unit price lives on each Prize. */
    paidEntriesAllowed: { type: Boolean, default: true },
    maxEntriesPerUser: { type: Number, min: 1, default: 1 },
    maxEntriesPerUserPerDay: { type: Number, min: 1 },
    /** One participation row per user per event is the spec rule; this flag only
     *  documents whether extra *entries* (bought via transactions) are allowed. */
    allowMultiplePrizesPerUser: { type: Boolean, default: false },
    requireDeviceReference: { type: Boolean, default: true },
    /** Grace period after endAt during which in-flight transactions still settle. */
    entryCloseGraceSeconds: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

/** Prize/draw configuration that is event-wide (per-prize data lives in Prize). */
const prizeConfigSchema = new mongoose.Schema(
  {
    /** [PDF] selection algorithm; default keeps the plan's documented assumption. */
    drawMethod: { type: String, enum: ['RANDOM', 'WEIGHTED_BY_ENTRIES'], default: 'RANDOM' },
    /** Days a winner has to act on a claim. Value is [PDF]; no default is invented. */
    claimWindowDays: { type: Number, min: 1 },
    allowDuplicateWinners: { type: Boolean, default: false },
    announcePublicly: { type: Boolean, default: true },
    hideLosingParticipants: { type: Boolean, default: true },
  },
  { _id: false },
);

const giveawaySchema = new mongoose.Schema(
  {
    // ----- identity -----------------------------------------------------------
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9](?:[a-z0-9-]{1,118}[a-z0-9])?$/, 'Slug must be a URL-safe string.'],
    },
    tagline: { type: String, trim: true, maxlength: 300 },
    description: { type: String, trim: true, maxlength: 20000 },
    descriptionHtml: { type: String },
    images: { type: [String], default: [] },
    icon: { type: String, trim: true },
    accent: { type: String, trim: true },

    // ----- rules & eligibility ------------------------------------------------
    rules: { type: rulesSchema, default: () => ({}) },
    eligibility: { type: eligibilitySchema, default: () => ({}) },

    // ----- lifecycle ----------------------------------------------------------
    status: { type: String, enum: GIVEAWAY_STATUSES, default: GIVEAWAY_STATUS.UPCOMING, index: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    /** Visibility switch: an unpublished draw is invisible to non-admin callers
     *  in any lifecycle state. Keeps "draft" out of the spec's 4-state lifecycle. */
    published: { type: Boolean, default: false, index: true },
    publishedAt: { type: Date },
    archivedAt: { type: Date },
    statusHistory: {
      type: [
        {
          from: String,
          to: String,
          at: Date,
          by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          reason: String,
        },
      ],
      default: [],
    },

    // ----- configuration ------------------------------------------------------
    prizeConfig: { type: prizeConfigSchema, default: () => ({}) },
    participation: { type: participationSchema, default: () => ({}) },

    featured: { type: Boolean, default: false, index: true },
    termsVersion: { type: String, trim: true },

    // ----- denormalized counters (read paths only; rebuilt by migration) ------
    stats: {
      participationCount: { type: Number, default: 0, min: 0 },
      entryCount: { type: Number, default: 0, min: 0 },
      winnerCount: { type: Number, default: 0, min: 0 },
      recalculatedAt: { type: Date },
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: jsonOptions(), toObject: objectOptions() },
);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
giveawaySchema.pre('validate', function validateWindow(next) {
  if (this.startAt && this.endAt && this.endAt <= this.startAt) {
    this.invalidate('endAt', 'endAt must be after startAt.');
  }
  next();
});

/**
 * Lifecycle transitions are forward-only and drawn from the documented table.
 * A brand-new document may start in any state (an imported/back-dated record).
 * The persisted status is captured on load with a non-enumerable symbol, so the
 * check compares against what is actually in the database, not the incoming edit.
 */
const ORIGINAL_STATUS = Symbol('veloop.giveaway.originalStatus');
giveawaySchema.post('init', function captureOriginal(doc) {
  Object.defineProperty(doc, ORIGINAL_STATUS, {
    value: doc.status,
    enumerable: false,
    configurable: true,
    writable: true,
  });
});
giveawaySchema.post('save', function recaptureOriginal(doc) {
  Object.defineProperty(doc, ORIGINAL_STATUS, {
    value: doc.status,
    enumerable: false,
    configurable: true,
    writable: true,
  });
});

giveawaySchema.pre('validate', function validateTransition(next) {
  if (this.isNew || !this.isModified('status')) return next();
  const from = this[ORIGINAL_STATUS];
  const allowed = from && GIVEAWAY_STATUS_TRANSITIONS[from];
  if (Array.isArray(allowed) && !allowed.includes(this.status)) {
    this.invalidate('status', `Illegal lifecycle transition ${from} -> ${this.status}.`);
  }
  next();
});

giveawaySchema.pre('save', function stampLifecycleFields(next) {
  const at = new Date();
  if (this.status === GIVEAWAY_STATUS.ARCHIVED) this.archivedAt = this.archivedAt || at;
  if (this.published && !this.publishedAt) this.publishedAt = at;
  // `statusHistory` is a TRANSITION log: creating a draw in its first state is not
  // a transition, so the creation moment stays where it belongs — in `createdAt`.
  if (this.isNew || !this.isModified('status')) return next();
  this.statusHistory = this.statusHistory || [];
  this.statusHistory.push({ from: this[ORIGINAL_STATUS], to: this.status, at });
  if (this.statusHistory.length > 50) this.statusHistory = this.statusHistory.slice(-50);
  next();
});

// ---------------------------------------------------------------------------
// Instance API used by the (future) entry and draw services
// ---------------------------------------------------------------------------
giveawaySchema.methods.isOpenForEntries = function isOpenForEntries(now = new Date()) {
  return (
    this.published &&
    ENTRY_OPEN_GIVEAWAY_STATUSES.includes(this.status) &&
    this.startAt <= now &&
    now <= new Date(this.endAt.getTime() + this.participation.entryCloseGraceSeconds * 1000)
  );
};

// ---------------------------------------------------------------------------
// Deletion policy — history is preserved.
// Only a never-published draw with no participation may be removed; anything
// else keeps its row for the audit trail.
// ---------------------------------------------------------------------------
blockDelete(giveawaySchema, {
  label: 'giveaway',
  unless: (doc) => doc.published === false && doc.status === GIVEAWAY_STATUS.UPCOMING && (doc.stats?.participationCount || 0) === 0,
});

// ---------------------------------------------------------------------------
// Indexes (creation is asserted in tests/integration/models.indexes.test.js)
// ---------------------------------------------------------------------------
giveawaySchema.index({ status: 1, endAt: -1 });
giveawaySchema.index({ published: 1, status: 1, startAt: 1 });
giveawaySchema.index({ published: 1, featured: 1, endAt: -1 });
giveawaySchema.index({ title: 'text', tagline: 'text' });

/** Written by the dev seed only; null on every real record. */
withSeedMarker(giveawaySchema);

module.exports = mongoose.model('Giveaway', giveawaySchema);
