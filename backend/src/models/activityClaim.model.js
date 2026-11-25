/**
 * ============================================================================
 * ACTIVITY CLAIM — one row per successful claim of one activity.
 * ============================================================================
 * The unique `(userId, activityId, claimKey)` index is what makes "the same
 * one-time reward cannot be claimed twice" a database guarantee: a duplicate
 * claim fails on the index before any balance moves, even under concurrency.
 *
 * `claimKey` encodes the cadence: `once` for a one-time activity, the UTC date
 * for a daily one, and the cooldown bucket for a cooldown activity.
 * ========================================================================= */
const mongoose = require('mongoose');
const { jsonOptions, objectOptions, withSeedMarker } = require('../utils/schema.js');
const { CURRENCIES } = require('../config/constants.js');

const activityClaimSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    activityId: { type: mongoose.Schema.Types.ObjectId, ref: 'RewardActivity', required: true },
    claimKey: { type: String, required: true, trim: true, maxlength: 40 },

    currency: { type: String, enum: CURRENCIES, required: true },
    /** Snapshot of the configured amount at claim time. */
    amount: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ['SUCCESS', 'REVERSED'], default: 'SUCCESS' },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletTransaction', default: null },
  },
  { timestamps: true, toJSON: jsonOptions(), toObject: objectOptions() },
);

activityClaimSchema.index({ userId: 1, activityId: 1, claimKey: 1 }, { unique: true });
activityClaimSchema.index({ activityId: 1, createdAt: -1 });
activityClaimSchema.index({ userId: 1, createdAt: -1 });

withSeedMarker(activityClaimSchema);

module.exports = mongoose.model('ActivityClaim', activityClaimSchema);
