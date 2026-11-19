/**
 * ============================================================================
 * CODE REDEMPTION — one row per (user, promo code).
 * ============================================================================
 * The unique (userId, code) index is what makes "a code can only be redeemed
 * once per account" a database guarantee rather than a check the service could
 * race past: the row is claimed BEFORE the wallet is credited, so a duplicate
 * request fails on the index instead of crediting twice.
 * ========================================================================= */
const mongoose = require('mongoose');
const { jsonOptions, objectOptions, withSeedMarker } = require('../utils/schema.js');
const { CURRENCIES } = require('../config/constants.js');

const codeRedemptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 40 },
    currency: { type: String, enum: CURRENCIES, required: true },
    amount: { type: Number, required: true, min: 1 },
    /** The balance the credit produced; null if the wallet could not report it. */
    balanceAfter: { type: Number, min: 0, default: null },
  },
  { timestamps: true, toJSON: jsonOptions(), toObject: objectOptions() },
);

/** A code is redeemable once per account (not once per device). */
codeRedemptionSchema.index({ userId: 1, code: 1 }, { unique: true });

/** Written by the dev seed only; null on every runtime redemption. */
withSeedMarker(codeRedemptionSchema);

module.exports = mongoose.model('CodeRedemption', codeRedemptionSchema);
