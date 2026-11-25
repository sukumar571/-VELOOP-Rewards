/**
 * ============================================================================
 * REWARD CODE SERVICE — validate and redeem codes against the reward wallet.
 * ============================================================================
 * Unlike the legacy `/wallet/redeem` seam (which could only credit the fictional
 * dev wallet adapter), this path credits the native reward wallet, so a code
 * works on every deployment and the amount is always the stored configuration.
 *
 * Redemption is safe under concurrency:
 *   1. the total cap is reserved with one guarded `$inc`, so N simultaneous
 *      redemptions cannot exceed `maxRedemptions`;
 *   2. the per-account row is incremented and checked against `perUserLimit`;
 *   3. the credit carries a per-account, per-count idempotency key, so a retry
 *      returns the original movement instead of crediting again.
 * Any failure releases both reservations.
 * ========================================================================= */
const RewardCode = require('../models/rewardCode.model.js');
const CodeRedemption = require('../models/codeRedemption.model.js');
const AuditLog = require('../models/auditLog.model.js');
const ledger = require('./rewardLedger.service.js');
const { domain } = require('../utils/domainErrors.js');
const { PROMO_CODES, normalizeCode } = require('../config/promoCodes.js');
const { REWARD_TRANSACTION_TYPE } = require('../config/constants.js');

/** Seeds the managed codes from the shipped catalogue when none exist yet. */
async function ensureCatalogue() {
  const count = await RewardCode.estimatedDocumentCount();
  if (count > 0) return;
  await RewardCode.insertMany(
    PROMO_CODES.map((c) => ({
      code: c.code,
      label: c.label,
      currency: c.currency,
      amount: c.amount,
      active: true,
      maxRedemptions: null,
      perUserLimit: 1,
    })),
  ).catch((err) => {
    if (!err || err.code !== 11000) throw err;
  });
}

function availabilityError(reason) {
  if (reason === 'EXPIRED') return domain('REWARD_CODE_EXPIRED');
  if (reason === 'NOT_STARTED') return domain('REWARD_CODE_NOT_STARTED');
  if (reason === 'EXHAUSTED') return domain('REWARD_CODE_LIMIT_REACHED');
  return domain('REDEEM_CODE_INVALID');
}

/** The redeemable catalogue plus this account's redemption state. */
async function listForUser({ userId }) {
  await ensureCatalogue();
  const now = new Date();
  const codes = await RewardCode.find({}).sort({ createdAt: 1 }).lean();
  const rows = await CodeRedemption.find({ userId, rewardCodeId: { $ne: null } })
    .select('rewardCodeId count')
    .lean();
  const used = new Map(rows.map((r) => [String(r.rewardCodeId), r.count]));

  return {
    redemptionAvailable: true,
    codes: codes.map((c) => {
      const availability = RewardCode.hydrate(c).availability(now);
      const redeemed = (used.get(String(c._id)) || 0) >= c.perUserLimit;
      return {
        id: String(c._id),
        code: c.code,
        label: c.label,
        currency: c.currency,
        amount: c.amount,
        active: c.active,
        expiresAt: c.expiresAt,
        redeemed,
        available: availability.open && !redeemed,
        availabilityReason: redeemed ? 'ALREADY_REDEEMED' : availability.reason,
      };
    }),
  };
}

/** Resolves a code without redeeming it, for the "Validate code" step. */
async function validateCode({ userId, rawCode }) {
  await ensureCatalogue();
  const code = normalizeCode(rawCode);
  if (!code) throw domain('REDEEM_CODE_INVALID');

  const row = await RewardCode.findOne({ code });
  if (!row) throw domain('REDEEM_CODE_INVALID');

  const availability = row.availability();
  if (!availability.open) throw availabilityError(availability.reason);

  const claim = await CodeRedemption.findOne({ userId, code: row.code }).lean();
  if (claim && claim.count >= row.perUserLimit) throw domain('REDEEM_CODE_ALREADY_REDEEMED');

  return {
    id: String(row._id),
    code: row.code,
    label: row.label,
    currency: row.currency,
    amount: row.amount,
    expiresAt: row.expiresAt,
    remainingForUser: Math.max(0, row.perUserLimit - (claim ? claim.count : 0)),
  };
}

/** Validates and credits one code. Returns the credited amount + new balance. */
async function redeem({ userId, rawCode, requestId }) {
  const preview = await validateCode({ userId, rawCode });
  const code = await RewardCode.findById(preview.id);
  if (!code) throw domain('REDEEM_CODE_INVALID');

  // 1) Reserve one of the total redemptions atomically (cap is in the filter).
  const filter = { _id: code._id, active: true };
  if (code.maxRedemptions !== null) filter.redemptionCount = { $lt: code.maxRedemptions };
  const reserved = await RewardCode.findOneAndUpdate(filter, { $inc: { redemptionCount: 1 } }, { new: true });
  if (!reserved) throw domain('REWARD_CODE_LIMIT_REACHED');

  // 2) Count this account's redemption; over-limit is rolled back immediately.
  let claim;
  try {
    claim = await CodeRedemption.findOneAndUpdate(
      { userId, code: code.code },
      {
        $inc: { count: 1 },
        $set: { lastRedeemedAt: new Date(), rewardCodeId: code._id },
        $setOnInsert: { currency: code.currency, amount: code.amount },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    if (claim.count > code.perUserLimit) throw domain('REDEEM_CODE_ALREADY_REDEEMED');
  } catch (err) {
    await RewardCode.updateOne({ _id: code._id }, { $inc: { redemptionCount: -1 } }).catch(() => null);
    if (err && err.code === 11000) throw domain('REDEEM_CODE_ALREADY_REDEEMED');
    if (claim) {
      await CodeRedemption.updateOne({ _id: claim._id }, { $inc: { count: -1 } }).catch(() => null);
    }
    throw err;
  }

  // 3) Credit the reward wallet with a key unique to this redemption count.
  let credited;
  try {
    credited = await ledger.credit({
      userId,
      currency: code.currency,
      amount: code.amount,
      type: REWARD_TRANSACTION_TYPE.PROMO_CODE,
      description: code.label || `Reward code ${code.code}`,
      referenceType: 'RewardCode',
      referenceId: String(code._id),
      idempotencyKey: `promo:${code._id}:${userId}:${claim.count}`,
      requestId,
    });
  } catch (err) {
    await RewardCode.updateOne({ _id: code._id }, { $inc: { redemptionCount: -1 } }).catch(() => null);
    if (claim.count > 1) {
      await CodeRedemption.updateOne({ _id: claim._id }, { $inc: { count: -1 } }).catch(() => null);
    } else {
      await CodeRedemption.deleteOne({ _id: claim._id }).catch(() => null);
    }
    throw err;
  }

  claim.transactionId = credited.transaction ? credited.transaction._id : null;
  claim.balanceAfter = credited.balance;
  await claim.save().catch(() => null);

  await AuditLog.record({
    actorId: userId,
    actorRole: 'user',
    action: 'reward.code.redeem',
    entityType: 'RewardCode',
    entityId: code._id,
    after: {
      code: code.code,
      currency: code.currency,
      amount: code.amount,
      balanceAfter: credited.balance,
    },
    requestId,
  }).catch(() => null);

  return {
    code: code.code,
    label: code.label,
    currency: code.currency,
    amount: code.amount,
    balance: credited.balance,
  };
}

/** The caller's own redemption history. */
async function history({ userId }) {
  const rows = await CodeRedemption.find({ userId })
    .sort({ lastRedeemedAt: -1, createdAt: -1 })
    .limit(100)
    .lean();
  return {
    items: rows.map((r) => ({
      id: String(r._id),
      code: r.code,
      currency: r.currency,
      amount: r.amount,
      count: r.count || 1,
      balanceAfter: r.balanceAfter,
      redeemedAt: r.lastRedeemedAt || r.createdAt,
    })),
  };
}

module.exports = { ensureCatalogue, listForUser, validateCode, redeem, history };
