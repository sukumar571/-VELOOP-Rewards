/**
 * ============================================================================
 * WALLET TRANSACTION — the append-only ledger of the native reward wallet.
 * ============================================================================
 * Every balance movement (activity reward, referral reward, promo code, admin
 * adjustment, giveaway entry debit) writes exactly one row here. The row records
 * who, which currency, how much, the direction, the resulting balances, a
 * reference to the thing that caused it, and a timestamp/status.
 *
 * `idempotencyKey` carries a UNIQUE index, which is the database guarantee that
 * a retried claim / replayed redemption can never credit twice: the second write
 * fails on the index before any balance moves. Rows are never deleted by
 * application code and a settled row is never re-labelled.
 * ========================================================================= */
const mongoose = require('mongoose');
const crypto = require('crypto');
const { jsonOptions, objectOptions, withSeedMarker } = require('../utils/schema.js');
const {
  CURRENCIES,
  REWARD_TRANSACTION_TYPES,
  REWARD_TRANSACTION_STATUSES,
  REWARD_TRANSACTION_STATUS,
  REWARD_DIRECTIONS,
  REWARD_DIRECTION,
} = require('../config/constants.js');

const walletTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    currency: { type: String, enum: CURRENCIES, required: true },
    /** Always a positive magnitude; `direction` carries the sign. */
    amount: { type: Number, required: true, min: 1 },
    direction: { type: String, enum: REWARD_DIRECTIONS, required: true },
    type: { type: String, enum: REWARD_TRANSACTION_TYPES, required: true },
    status: {
      type: String,
      enum: REWARD_TRANSACTION_STATUSES,
      default: REWARD_TRANSACTION_STATUS.PENDING,
    },

    balanceBefore: { type: Number, min: 0, default: null },
    balanceAfter: { type: Number, min: 0, default: null },

    /** What caused the movement (activity claim, referral, code, admin, entry). */
    referenceType: { type: String, trim: true, maxlength: 40, default: null },
    referenceId: { type: String, trim: true, maxlength: 80, default: null },
    description: { type: String, trim: true, maxlength: 300, default: null },

    /** Anti-double-credit key. UNIQUE at the database level. */
    idempotencyKey: { type: String, required: true, trim: true },
    transactionId: { type: String, required: true, unique: true, default: () => `wtx_${crypto.randomUUID()}` },
    failureReason: { type: String, trim: true, maxlength: 120, default: null },
    requestId: { type: String, trim: true, maxlength: 80, default: null },
  },
  { timestamps: true, toJSON: jsonOptions(), toObject: objectOptions() },
);

walletTransactionSchema.index({ idempotencyKey: 1 }, { unique: true });
walletTransactionSchema.index({ userId: 1, createdAt: -1 });
walletTransactionSchema.index({ type: 1, createdAt: -1 });
walletTransactionSchema.index({ referenceType: 1, referenceId: 1 });

/** Client-safe shape; internal keys (idempotency) never leave the server. */
walletTransactionSchema.methods.toClient = function toClient() {
  return {
    id: String(this._id),
    transactionId: this.transactionId,
    currency: this.currency,
    amount: this.amount,
    direction: this.direction,
    type: this.type,
    status: this.status,
    balanceBefore: this.balanceBefore,
    balanceAfter: this.balanceAfter,
    referenceType: this.referenceType,
    referenceId: this.referenceId,
    description: this.description,
    createdAt: this.createdAt,
  };
};

walletTransactionSchema.statics.DIRECTION = REWARD_DIRECTION;

withSeedMarker(walletTransactionSchema);

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
