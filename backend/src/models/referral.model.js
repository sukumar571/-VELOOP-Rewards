/**
 * ============================================================================
 * REFERRAL — the recorded relationship between a referrer and a new account.
 * ============================================================================
 * A referral is created when a NEW account registers with someone's code. It is
 * PENDING until the configured qualification rules are met (and, optionally, an
 * administrator approves it), then QUALIFIED — and only qualification credits a
 * reward. Opening a link, on its own, rewards nothing.
 *
 * `refereeId` is UNIQUE: one account can only ever be referred once, which
 * blocks duplicate and circular referral abuse at the database level.
 * ========================================================================= */
const mongoose = require('mongoose');
const { jsonOptions, objectOptions, withSeedMarker } = require('../utils/schema.js');
const { CURRENCIES, REFERRAL_STATUSES, REFERRAL_STATUS } = require('../config/constants.js');

const referralRewardSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['REFERRER', 'REFEREE'], required: true },
    currency: { type: String, enum: CURRENCIES, required: true },
    amount: { type: Number, required: true, min: 1 },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletTransaction', default: null },
  },
  { _id: false },
);

const referralSchema = new mongoose.Schema(
  {
    referrerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** Unique — an account is only ever referred once. */
    refereeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 },

    status: {
      type: String,
      enum: REFERRAL_STATUSES,
      default: REFERRAL_STATUS.PENDING,
      index: true,
    },
    qualifiedAt: { type: Date, default: null },
    rewards: { type: [referralRewardSchema], default: [] },

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    note: { type: String, trim: true, maxlength: 300, default: null },
  },
  { timestamps: true, toJSON: jsonOptions(), toObject: objectOptions() },
);

referralSchema.index({ refereeId: 1 }, { unique: true });
referralSchema.index({ referrerId: 1, status: 1, createdAt: -1 });

withSeedMarker(referralSchema);

module.exports = mongoose.model('Referral', referralSchema);
