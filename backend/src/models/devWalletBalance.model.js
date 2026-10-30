/**
 * ============================================================================
 * DEV WALLET BALANCE — the FICTIONAL, authoritative balance store for the
 * `dev` wallet adapter ONLY.
 * ============================================================================
 * This collection is NOT the VELOOP wallet and NOT the `WalletReference` cache.
 * It exists so a development/test deployment can exercise the REAL money path —
 * balance debit, participation, ledger row and audit event — inside ONE MongoDB
 * transaction, because the balances live in the same database the transaction
 * spans. Nothing here is ever presented to a client as a real wallet balance: the
 * adapter tags every observation `DEVELOPMENT_FIXTURE` and the config gate refuses
 * `WALLET_MODE=dev` in production.
 *
 * Concurrency: the ONLY sanctioned way to move these balances is the guarded,
 * atomic `debit`/`credit` statics below. A debit uses a `{ balance: { $gte: amount } }`
 * filter, so an over-spend simply matches nothing (no negative balance, no lost
 * update) even when two requests race — the unique (userId, currency) index plus the
 * atomic `$inc` are what make "never deduct twice" and "never go negative" hold.
 * ========================================================================= */
const mongoose = require('mongoose');
const { jsonOptions, objectOptions, withSeedMarker } = require('../utils/schema.js');
const { CURRENCIES } = require('../config/constants.js');

const devWalletBalanceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    currency: { type: String, enum: CURRENCIES, required: true },
    // Always a non-negative whole observation; `min: 0` is the last line of defence
    // behind the guarded atomic update in `debit`.
    balance: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true, toJSON: jsonOptions(), toObject: objectOptions() },
);

/** Exactly one balance row per (user, currency) — the natural debit target. */
devWalletBalanceSchema.index({ userId: 1, currency: 1 }, { unique: true });

/**
 * Reads a balance. Returns `{ balance }` or `null` when there is no row yet.
 * `session` lets the read join the caller's transaction (snapshot isolation).
 */
devWalletBalanceSchema.statics.readBalance = async function readBalance({ userId, currency, session } = {}) {
  const row = await this.findOne({ userId, currency }).session(session || null).lean();
  return row ? { balance: row.balance, currency: row.currency, userId: String(row.userId) } : null;
};

/**
 * Atomically debits `amount` from one user+currency. The `balance: { $gte: amount }`
 * filter means an insufficient (or absent) balance matches nothing, so no write
 * happens and the function returns `null` — the caller maps that to
 * INSUFFICIENT_BALANCE and the surrounding transaction stays clean.
 *
 * @returns {Promise<{balanceBefore:number, balanceAfter:number}|null>}
 */
devWalletBalanceSchema.statics.debit = async function debit({ userId, currency, amount, session } = {}) {
  const spent = await this.findOneAndUpdate(
    { userId, currency, balance: { $gte: amount } },
    { $inc: { balance: -amount } },
    { new: true, session: session || null },
  ).lean();
  if (!spent) return null;
  return { balanceBefore: spent.balance + amount, balanceAfter: spent.balance };
};

/**
 * Atomically credits `amount` back (the compensating action for a reversal). This is
 * an unconditional `$inc`, so it can never fail to find the row it is refunding into
 * the account that was debited (which must therefore exist).
 *
 * @returns {Promise<{balanceBefore:number, balanceAfter:number}|null>}
 */
devWalletBalanceSchema.statics.credit = async function credit({ userId, currency, amount, session } = {}) {
  const gained = await this.findOneAndUpdate(
    { userId, currency },
    { $inc: { balance: amount } },
    { new: true, session: session || null },
  ).lean();
  if (!gained) return null;
  return { balanceBefore: gained.balance - amount, balanceAfter: gained.balance };
};

/** Written by the dev seed only; null on every runtime-mutated row. */
withSeedMarker(devWalletBalanceSchema);

module.exports = mongoose.model('DevWalletBalance', devWalletBalanceSchema);
