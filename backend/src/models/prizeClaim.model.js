/**
 * PrizeClaim — a winner's claim for a specific prize.
 *
 * Spec coverage: winner reference, user reference, prize reference, claim
 * deadline, status, submitted fulfilment details and timestamps.
 *
 * Two things this model is responsible for:
 *  1. `claimType` is copied from the prize at draw time and the submitted
 *     fulfilment MUST match that type (a physical claim needs an address, a
 *     digital claim needs a delivery target) — so claim rules stay declarative
 *     and are never re-derived from prize names in controllers.
 *  2. Access is restricted to the authorized winner and admins. The private
 *     `fulfillment` block is stripped from every serialization unless the
 *     server-side reader has already proved it is the owner, and the finders
 *     below always scope by userId for non-admin callers.
 */
const mongoose = require('mongoose');
const { jsonOptions, objectOptions, blockDelete, immutableOnce, withSeedMarker } = require('../utils/schema.js');
const {
  CLAIM_STATUSES,
  CLAIM_STATUS,
  CLAIM_TYPES,
  CLAIM_TYPE,
  CLAIM_TYPE_FULFILMENT_SHAPE,
  PRIZE_TYPES,
} = require('../config/constants.js');

const physicalFulfilment = {
  fullName: { type: String, trim: true, maxlength: 120 },
  phone: { type: String, trim: true, maxlength: 20 },
  address: { type: String, trim: true, maxlength: 400 },
  city: { type: String, trim: true, maxlength: 80 },
  state: { type: String, trim: true, maxlength: 80 },
  country: { type: String, trim: true, uppercase: true, maxlength: 2 },
  postalCode: { type: String, trim: true, maxlength: 12 },
};
const digitalFulfilment = {
  deliveryEmail: { type: String, trim: true, lowercase: true, maxlength: 254 },
  /** Masked in every response; the real value lives in the notification layer. */
  deliveryTargetMasked: { type: String, trim: true, maxlength: 120 },
};

/** Statuses a claim may move to from each current status. */
const STATUS_TRANSITIONS = Object.freeze({
  [CLAIM_STATUS.NOT_SUBMITTED]: [CLAIM_STATUS.SUBMITTED, CLAIM_STATUS.EXPIRED],
  [CLAIM_STATUS.SUBMITTED]: [CLAIM_STATUS.PROCESSING, CLAIM_STATUS.SUBMITTED],
  [CLAIM_STATUS.PROCESSING]: [CLAIM_STATUS.COMPLETED, CLAIM_STATUS.SUBMITTED],
  [CLAIM_STATUS.COMPLETED]: [],
  [CLAIM_STATUS.EXPIRED]: [],
});

const REQUIRED_PHYSICAL_FIELDS = ['fullName', 'address', 'city', 'state', 'postalCode', 'phone'];

const claimSchema = new mongoose.Schema(
  {
    winnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'GiveawayWinner', required: true, unique: true },
    giveawayId: { type: mongoose.Schema.Types.ObjectId, ref: 'Giveaway', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    prizeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prize', required: true },

    /** Copied from the prize so the claim is self-describing for its whole life. */
    claimType: { type: String, enum: CLAIM_TYPES, required: true },
    prizeType: { type: String, enum: PRIZE_TYPES, required: true },

    deadlineAt: { type: Date, required: true },
    status: { type: String, enum: CLAIM_STATUSES, default: CLAIM_STATUS.NOT_SUBMITTED, index: true },

    /** PII: never serialized by default (see jsonOptions privatePaths). */
    fulfillment: {
      physical: { ...physicalFulfilment },
      digital: { ...digitalFulfilment },
    },

    submittedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    notifiedAt: { type: Date, default: null },
    reminderCount: { type: Number, min: 0, default: 0 },
    /** Operator notes for fulfilment; must not repeat the winner's PII. */
    internalNote: { type: String, trim: true, maxlength: 1000 },
    history: {
      type: [
        {
          from: String,
          to: String,
          at: Date,
          by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          actorKind: { type: String, enum: ['WINNER', 'ADMIN', 'SYSTEM'] },
          note: String,
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: jsonOptions({ privatePaths: ['fulfillment', 'internalNote', 'history'] }),
    toObject: objectOptions({ privatePaths: ['fulfillment'] }),
  },
);

// ---------------------------------------------------------------------------
// Validation — claim type drives the required fulfilment shape
// ---------------------------------------------------------------------------
claimSchema.pre('validate', function validateFulfilmentMatchesClaimType(next) {
  const shape = CLAIM_TYPE_FULFILMENT_SHAPE[this.claimType];
  const f = this.fulfillment || {};

  // Nothing to check until the winner has actually handed something in: a claim
  // may legitimately sit at NOT_SUBMITTED, or expire without ever being filled.
  const requiresDetails = [CLAIM_STATUS.SUBMITTED, CLAIM_STATUS.PROCESSING, CLAIM_STATUS.COMPLETED].includes(this.status);

  if (shape === 'none') {
    const touched = (this.modifiedPaths() || []).some((p) => p.startsWith('fulfillment.'));
    if (touched) {
      this.invalidate('fulfillment', 'AUTOMATIC claims do not accept winner-supplied details.');
    }
    return next();
  }
  if (!requiresDetails) return next();

  if (shape === 'physical') {
    const missing = REQUIRED_PHYSICAL_FIELDS.filter((k) => !f.physical || !f.physical[k]);
    if (missing.length) {
      this.invalidate('fulfillment.physical', `A FORM claim requires: ${missing.join(', ')}.`);
    }
  } else if (shape === 'digital') {
    if (!f.digital || !f.digital.deliveryEmail) {
      this.invalidate('fulfillment.digital.deliveryEmail', 'A DIGITAL_DELIVERY claim requires a delivery target.');
    }
  }
  next();
});

const ORIGINAL_STATUS = Symbol('veloop.claim.originalStatus');
const remember = function remember(doc) {
  Object.defineProperty(doc, ORIGINAL_STATUS, {
    value: doc.status,
    enumerable: false,
    configurable: true,
    writable: true,
  });
};
claimSchema.post('init', remember);
claimSchema.post('save', remember);

claimSchema.pre('validate', function validateStatusMove(next) {
  if (this.isNew || !this.isModified('status')) return next();
  const from = this[ORIGINAL_STATUS];
  const allowed = STATUS_TRANSITIONS[from] || [];
  if (!allowed.includes(this.status)) {
    this.invalidate('status', `Illegal claim transition ${from} -> ${this.status}.`);
  }
  next();
});

/**
 * A submitted claim cannot be back-dated past its own deadline, and a claim whose
 * deadline has passed cannot be submitted at all — an admin must extend
 * `deadlineAt` first (an audited action), which is the only legitimate way a late
 * submission is accepted.
 */
claimSchema.pre('validate', function validateDeadline(next) {
  const now = new Date();
  const isAFreshSubmission = this.status === CLAIM_STATUS.SUBMITTED && !this.submittedAt;
  if (isAFreshSubmission && this.deadlineAt && this.deadlineAt < now) {
    this.invalidate('deadlineAt', 'This claim cannot be submitted after the deadline; an admin must extend deadlineAt first.');
  }
  if (this.submittedAt && this.deadlineAt && this.submittedAt > this.deadlineAt) {
    this.invalidate('submittedAt', 'Claim was submitted after the deadline; an admin must extend deadlineAt first.');
  }
  next();
});

claimSchema.pre('save', function stampStatusHistory(next) {
  const at = new Date();
  if (this.status === CLAIM_STATUS.SUBMITTED) this.submittedAt = this.submittedAt || at;
  if (this.status === CLAIM_STATUS.COMPLETED) this.completedAt = this.completedAt || at;
  // `history` is a transition log; the row's creation state is not a transition.
  if (this.isNew || !this.isModified('status')) return next();
  const from = this[ORIGINAL_STATUS];
  this.history = this.history || [];
  this.history.push({ from, to: this.status, at });
  if (this.history.length > 30) this.history = this.history.slice(-30);
  next();
});

claimSchema.methods.isExpired = function isExpired(now = new Date()) {
  return (
    (this.status === CLAIM_STATUS.NOT_SUBMITTED || this.status === CLAIM_STATUS.SUBMITTED) &&
    this.deadlineAt < now
  );
};

// ---------------------------------------------------------------------------
// Access restriction — server-side, never "trust the client filter"
// ---------------------------------------------------------------------------
/**
 * Non-admin callers can only ever load their own claim: the scope is applied here
 * so a forgotten `where` in a controller cannot leak another winner's address.
 */
claimSchema.statics.findScoped = function findScoped(filter, { asUserId = null, isAdmin = false } = {}) {
  const scoped = isAdmin ? filter : { ...filter, userId: asUserId };
  return this.find(scoped);
};

/** Ownership/role check used before returning private fulfilment data. */
claimSchema.methods.canBeReadBy = function canBeReadBy(requestingUserId, isAdmin = false) {
  if (isAdmin) return true;
  return Boolean(requestingUserId) && String(this.userId) === String(requestingUserId);
};

/**
 * The only representation safe for an unauthorized surface: no PII, no operator
 * notes, no history.
 */
claimSchema.methods.toPublicJSON = function toPublicJSON(now = new Date()) {
  return {
    id: String(this._id),
    giveawayId: String(this.giveawayId),
    prizeId: String(this.prizeId),
    claimType: this.claimType,
    prizeType: this.prizeType,
    status: this.isExpired(now) ? CLAIM_STATUS.EXPIRED : this.status,
    deadlineAt: this.deadlineAt,
    submittedAt: this.submittedAt || null,
    canSubmit: this.status === CLAIM_STATUS.NOT_SUBMITTED && this.deadlineAt > now,
  };
};

claimSchema.statics.STATUS_TRANSITIONS = STATUS_TRANSITIONS;
claimSchema.statics.REQUIRED_PHYSICAL_FIELDS = REQUIRED_PHYSICAL_FIELDS;

// ---------------------------------------------------------------------------
// Immutability + deletion policy
// ---------------------------------------------------------------------------
// The claim's identity is frozen once the winner has submitted. `deadlineAt` is
// deliberately excluded: an admin may extend a deadline (an audited action), and
// that is the only way a late submission can legitimately be accepted.
immutableOnce(claimSchema, {
  paths: ['winnerId', 'userId', 'prizeId', 'giveawayId', 'claimType', 'prizeType'],
  isTerminal: (doc) => doc.status !== CLAIM_STATUS.NOT_SUBMITTED,
  label: 'claim',
});

blockDelete(claimSchema, {
  label: 'claim',
  // An untouched claim (never submitted) may be removed; anything else is history.
  unless: (doc) =>
    doc.status === CLAIM_STATUS.NOT_SUBMITTED &&
    !doc.submittedAt &&
    (!doc.fulfillment || (Object.keys(doc.fulfillment.physical || {}).length === 0 && !doc.fulfillment.digital?.deliveryEmail)),
});

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
claimSchema.index({ userId: 1, status: 1 });
claimSchema.index({ giveawayId: 1, status: 1 });
// Expiry sweep: claims that pass their deadline still open.
claimSchema.index({ status: 1, deadlineAt: 1 });
claimSchema.index({ prizeId: 1 });

/** Written by the dev seed only; null on every real record. */
withSeedMarker(claimSchema);

module.exports = mongoose.model('PrizeClaim', claimSchema);
