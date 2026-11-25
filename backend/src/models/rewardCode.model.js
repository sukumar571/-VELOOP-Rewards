/**
 * ============================================================================
 * REWARD CODE — a promo code stored in the database, managed by admins.
 * ============================================================================
 * The code, its currency and its amount live here (never in the request), plus
 * its active switch, expiry, total redemption cap and per-account cap. A code
 * with `maxRedemptions: null` is multi-use until it is deactivated; one with a
 * number is capped at that many total redemptions.
 *
 * `redemptionCount` is incremented atomically with a guard, so the cap cannot be
 * exceeded by two concurrent redemptions.
 * ========================================================================= */
const mongoose = require('mongoose');
const { jsonOptions, objectOptions, withSeedMarker } = require('../utils/schema.js');
const { CURRENCIES } = require('../config/constants.js');

const rewardCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 40 },
    label: { type: String, trim: true, maxlength: 120, default: '' },
    currency: { type: String, enum: CURRENCIES, required: true },
    amount: { type: Number, required: true, min: 1 },

    active: { type: Boolean, default: true, index: true },
    startsAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    /** null = no total cap (multi-use). */
    maxRedemptions: { type: Number, min: 1, default: null },
    perUserLimit: { type: Number, min: 1, max: 100, default: 1 },
    redemptionCount: { type: Number, min: 0, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: jsonOptions(), toObject: objectOptions() },
);

rewardCodeSchema.index({ code: 1 }, { unique: true });

/** Open for redemption at `now`? Returns a reason code otherwise. */
rewardCodeSchema.methods.availability = function availability(now = new Date()) {
  if (!this.active) return { open: false, reason: 'INACTIVE' };
  if (this.startsAt && new Date(this.startsAt) > now) return { open: false, reason: 'NOT_STARTED' };
  if (this.expiresAt && new Date(this.expiresAt) <= now) return { open: false, reason: 'EXPIRED' };
  if (this.maxRedemptions !== null && this.redemptionCount >= this.maxRedemptions) {
    return { open: false, reason: 'EXHAUSTED' };
  }
  return { open: true, reason: null };
};

withSeedMarker(rewardCodeSchema);

module.exports = mongoose.model('RewardCode', rewardCodeSchema);
