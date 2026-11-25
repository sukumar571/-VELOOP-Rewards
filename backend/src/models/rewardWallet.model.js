/**
 * ============================================================================
 * REWARD WALLET — the reward balances this application owns.
 * ============================================================================
 * This collection is the app's OWN reward wallet (VEs / SVEs / Tokens earned
 * through activities, referrals and promo codes). It is intentionally separate
 * from `WalletReference`, which only caches what an EXTERNAL VELOOP wallet
 * provider last reported. Nothing here is ever presented as external funds.
 *
 * The only sanctioned way to move a balance is `credit` / `debit` below:
 *  - one row per user (unique `userId`), created with zeros, never a random value;
 *  - `credit` is an atomic `$inc` (never a read-then-write);
 *  - `debit` filters on `{ balance: { $gte: amount } }`, so an over-spend matches
 *    nothing and a balance can never go negative, even under concurrency.
 * Every movement is paired with a row in `WalletTransaction` by the ledger
 * service — this model alone is not the audit trail.
 * ========================================================================= */
const mongoose = require('mongoose');
const { jsonOptions, objectOptions, withSeedMarker } = require('../utils/schema.js');
const { CURRENCIES } = require('../config/constants.js');

const balancesSchema = new mongoose.Schema(
  {
    VE: { type: Number, required: true, min: 0, default: 0 },
    SVE: { type: Number, required: true, min: 0, default: 0 },
    TOKEN: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false },
);

const rewardWalletSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    balances: { type: balancesSchema, required: true, default: () => ({}) },
  },
  { timestamps: true, toJSON: jsonOptions(), toObject: objectOptions() },
);

/** Exactly one reward wallet per account. A second one is impossible. */
rewardWalletSchema.index({ userId: 1 }, { unique: true });

const ZERO = Object.freeze({ VE: 0, SVE: 0, TOKEN: 0 });

/**
 * Returns the caller's wallet, creating it with ZERO balances on first use.
 * `$setOnInsert` makes the create idempotent, so two concurrent reads cannot
 * produce two wallets and an existing balance is never reset.
 */
rewardWalletSchema.statics.ensure = async function ensure(userId) {
  const wallet = await this.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, balances: { ...ZERO } } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return wallet;
};

/** Plain `{ VE, SVE, TOKEN }` with any missing value reported as 0 (never null). */
rewardWalletSchema.statics.balancesOf = function balancesOf(wallet) {
  const out = {};
  for (const currency of CURRENCIES) {
    const value = wallet && wallet.balances ? wallet.balances[currency] : 0;
    out[currency] = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }
  return out;
};

/** Atomic credit with upsert, returning `{ balanceBefore, balanceAfter }`. */
rewardWalletSchema.statics.credit = async function credit({ userId, currency, amount }) {
  if (!CURRENCIES.includes(currency)) throw new Error(`UNKNOWN_CURRENCY: ${currency}`);
  const doc = await this.findOneAndUpdate(
    { userId },
    { $inc: { [`balances.${currency}`]: amount }, $setOnInsert: { userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  const balanceAfter = doc.balances[currency];
  return { balanceBefore: balanceAfter - amount, balanceAfter };
};

/**
 * Guarded atomic debit. Returns null when the balance is too low — the caller
 * maps that to INSUFFICIENT_BALANCE and writes no ledger success row.
 */
rewardWalletSchema.statics.debit = async function debit({ userId, currency, amount }) {
  if (!CURRENCIES.includes(currency)) throw new Error(`UNKNOWN_CURRENCY: ${currency}`);
  const doc = await this.findOneAndUpdate(
    { userId, [`balances.${currency}`]: { $gte: amount } },
    { $inc: { [`balances.${currency}`]: -amount } },
    { new: true },
  );
  if (!doc) return null;
  const balanceAfter = doc.balances[currency];
  return { balanceBefore: balanceAfter + amount, balanceAfter };
};

withSeedMarker(rewardWalletSchema);

module.exports = mongoose.model('RewardWallet', rewardWalletSchema);
