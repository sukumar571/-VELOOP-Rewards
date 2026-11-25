/**
 * ============================================================================
 * REWARD ACTIVITY — an admin-configured way to earn reward currency.
 * ============================================================================
 * The amount, currency, window, claim cadence and eligibility rules are ALL
 * stored here, so the frontend never decides what a reward is worth. A global
 * `active` switch plus the start/end window decide availability; the service
 * enforces both, and `ActivityClaim` enforces one claim per configured period.
 * ========================================================================= */
const mongoose = require('mongoose');
const { jsonOptions, objectOptions, withSeedMarker } = require('../utils/schema.js');
const { CURRENCIES, ACTIVITY_CLAIM_MODES } = require('../config/constants.js');

const rewardActivitySchema = new mongoose.Schema(
  {
    /** Stable machine key, e.g. `daily-login`. Unique. */
    key: { type: String, required: true, trim: true, lowercase: true, maxlength: 60 },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 400, default: '' },

    currency: { type: String, enum: CURRENCIES, required: true },
    amount: { type: Number, required: true, min: 1 },

    /** ONCE per account, DAILY (calendar day, UTC), or per COOLDOWN window. */
    claimMode: { type: String, enum: ACTIVITY_CLAIM_MODES, default: 'ONCE' },
    cooldownHours: { type: Number, min: 1, max: 720, default: 24 },
    /** Total claims one account may ever make (defaults to one per mode). */
    maxClaimsPerUser: { type: Number, min: 1, max: 10000, default: 1 },

    /** Availability window. Null = open-ended on that side. */
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    active: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },

    eligibility: {
      /** Minimum account age in hours before a claim is allowed. */
      minAccountAgeHours: { type: Number, min: 0, max: 8760, default: 0 },
      /** Require at least one recorded giveaway participation. */
      requireParticipation: { type: Boolean, default: false },
      /** 'ACTIVE' | 'VERIFIED' | 'ANY' — account status the claimer must hold. */
      kycStatus: { type: String, enum: ['ANY', 'VERIFIED'], default: 'ANY' },
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: jsonOptions(), toObject: objectOptions() },
);

rewardActivitySchema.index({ key: 1 }, { unique: true });
rewardActivitySchema.index({ active: 1, sortOrder: 1, createdAt: 1 });

/** Is the activity open for claims at `now`? Returns a reason code otherwise. */
rewardActivitySchema.methods.availability = function availability(now = new Date()) {
  if (!this.active) return { open: false, reason: 'INACTIVE' };
  if (this.startsAt && new Date(this.startsAt) > now) return { open: false, reason: 'NOT_STARTED' };
  if (this.endsAt && new Date(this.endsAt) <= now) return { open: false, reason: 'EXPIRED' };
  return { open: true, reason: null };
};

withSeedMarker(rewardActivitySchema);

module.exports = mongoose.model('RewardActivity', rewardActivitySchema);
