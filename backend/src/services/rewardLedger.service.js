/**
 * ============================================================================
 * REWARD LEDGER — the ONLY writer of native reward balances.
 * ============================================================================
 * Every credit/debit goes through this service so that three invariants hold
 * everywhere, not just in the endpoint that happens to remember them:
 *
 *  1. ATOMIC — the balance moves with a single guarded `$inc` on RewardWallet;
 *     no read-modify-write, so concurrent requests cannot lose an update or push
 *     a balance below zero.
 *  2. IDEMPOTENT — each movement carries a unique `idempotencyKey` on
 *     WalletTransaction. A replayed claim/redemption hits the unique index and
 *     returns the original row instead of crediting again.
 *  3. RECORDED — every successful movement writes the resulting before/after
 *     balances and a reference to its cause, which is the transaction history.
 * ========================================================================= */
const RewardWallet = require('../models/rewardWallet.model.js');
const WalletTransaction = require('../models/walletTransaction.model.js');
const { domain } = require('../utils/domainErrors.js');
const {
  REWARD_TRANSACTION_STATUS,
  REWARD_DIRECTION,
  CURRENCIES,
} = require('../config/constants.js');

const INITIAL = Object.freeze({ VE: 0, SVE: 0, TOKEN: 0 });

/** Zero-initialised wallet for the account (creating it once, never again). */
async function ensureWallet(userId) {
  const wallet = await RewardWallet.ensure(userId);
  return { wallet, balances: RewardWallet.balancesOf(wallet) };
}

/** Reads a wallet without creating one (for admin/reporting reads). */
async function readBalances(userId) {
  const wallet = await RewardWallet.findOne({ userId }).lean();
  return wallet ? RewardWallet.balancesOf(wallet) : { ...INITIAL };
}

function assertAmount(amount) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`INVALID_REWARD_AMOUNT: ${amount}`);
  }
}

function assertCurrency(currency) {
  if (!CURRENCIES.includes(currency)) throw new Error(`UNKNOWN_CURRENCY: ${currency}`);
}

/**
 * Credits a reward. Returns `{ duplicate, transaction, balance }`.
 * `idempotencyKey` is required — there is no anonymous credit path.
 */
async function credit({
  userId,
  currency,
  amount,
  type,
  description = null,
  referenceType = null,
  referenceId = null,
  idempotencyKey,
  requestId = null,
}) {
  assertCurrency(currency);
  assertAmount(amount);
  if (!idempotencyKey) throw new Error('REWARD_IDEMPOTENCY_KEY_REQUIRED');
  if (!type) throw new Error('REWARD_TRANSACTION_TYPE_REQUIRED');

  const existing = await WalletTransaction.findOne({ idempotencyKey }).lean();
  if (existing) {
    return { duplicate: true, transaction: existing, balance: existing.balanceAfter };
  }

  let txn;
  try {
    txn = await WalletTransaction.create({
      userId,
      currency,
      amount,
      direction: REWARD_DIRECTION.CREDIT,
      type,
      status: REWARD_TRANSACTION_STATUS.PENDING,
      referenceType,
      referenceId,
      description,
      idempotencyKey,
      requestId,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      const raced = await WalletTransaction.findOne({ idempotencyKey }).lean();
      return { duplicate: true, transaction: raced, balance: raced ? raced.balanceAfter : null };
    }
    throw err;
  }

  let moved;
  try {
    moved = await RewardWallet.credit({ userId, currency, amount });
  } catch (err) {
    txn.status = REWARD_TRANSACTION_STATUS.FAILED;
    txn.failureReason = 'WALLET_CREDIT_FAILED';
    await txn.save().catch(() => null);
    throw err;
  }

  txn.status = REWARD_TRANSACTION_STATUS.SUCCESS;
  txn.balanceBefore = moved.balanceBefore;
  txn.balanceAfter = moved.balanceAfter;
  await txn.save().catch(() => null);

  return { duplicate: false, transaction: txn, balance: moved.balanceAfter };
}

/**
 * Debits the reward wallet. Returns `{ transaction, balance }`; throws
 * INSUFFICIENT_BALANCE when the guarded update matches nothing, leaving a FAILED
 * ledger row and an untouched balance.
 */
async function debit({
  userId,
  currency,
  amount,
  type,
  description = null,
  referenceType = null,
  referenceId = null,
  idempotencyKey,
  requestId = null,
}) {
  assertCurrency(currency);
  assertAmount(amount);
  if (!idempotencyKey) throw new Error('REWARD_IDEMPOTENCY_KEY_REQUIRED');

  const existing = await WalletTransaction.findOne({ idempotencyKey }).lean();
  if (existing) {
    return { duplicate: true, transaction: existing, balance: existing.balanceAfter };
  }

  const txn = await WalletTransaction.create({
    userId,
    currency,
    amount,
    direction: REWARD_DIRECTION.DEBIT,
    type,
    status: REWARD_TRANSACTION_STATUS.PENDING,
    referenceType,
    referenceId,
    description,
    idempotencyKey,
    requestId,
  });

  const moved = await RewardWallet.debit({ userId, currency, amount });
  if (!moved) {
    txn.status = REWARD_TRANSACTION_STATUS.FAILED;
    txn.failureReason = 'INSUFFICIENT_BALANCE';
    await txn.save().catch(() => null);
    throw domain('INSUFFICIENT_BALANCE');
  }

  txn.status = REWARD_TRANSACTION_STATUS.SUCCESS;
  txn.balanceBefore = moved.balanceBefore;
  txn.balanceAfter = moved.balanceAfter;
  await txn.save().catch(() => null);

  return { duplicate: false, transaction: txn, balance: moved.balanceAfter };
}

/** Wallet summary + the most recent movements, for the wallet dashboard. */
async function walletSummary({ userId, recent = 10 }) {
  const { balances } = await ensureWallet(userId);
  const rows = await WalletTransaction.find({ userId, status: REWARD_TRANSACTION_STATUS.SUCCESS })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(recent, 1), 50));
  return {
    balances,
    recentTransactions: rows.map((r) => r.toClient()),
  };
}

/** Paginated transaction history, scoped to one account. */
async function history({ userId, page = 1, limit = 20, currency, type }) {
  const filter = { userId };
  if (currency) filter.currency = currency;
  if (type) filter.type = type;
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    WalletTransaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    WalletTransaction.countDocuments(filter),
  ]);
  return {
    items: rows.map((r) => r.toClient()),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

module.exports = { ensureWallet, readBalances, credit, debit, walletSummary, history };
