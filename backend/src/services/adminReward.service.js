/**
 * ============================================================================
 * ADMIN REWARD SERVICE — configuration & oversight of the reward programme.
 * ============================================================================
 * Every mutation copies an allow-listed set of fields from a Zod-validated body,
 * so a caller can never inject `createdBy`, a balance, a redemption counter or a
 * claim row. Every state change is written to AuditLog.
 *
 * Reward amounts are ALWAYS supplied by an administrator here — this service
 * never invents a value, and the client never submits one during a claim.
 * ========================================================================= */
const crypto = require('crypto');
const RewardActivity = require('../models/rewardActivity.model.js');
const ActivityClaim = require('../models/activityClaim.model.js');
const RewardCode = require('../models/rewardCode.model.js');
const CodeRedemption = require('../models/codeRedemption.model.js');
const Referral = require('../models/referral.model.js');
const RewardWallet = require('../models/rewardWallet.model.js');
const WalletTransaction = require('../models/walletTransaction.model.js');
const User = require('../models/user.model.js');
const AuditLog = require('../models/auditLog.model.js');
const ledger = require('./rewardLedger.service.js');
const referral = require('./referral.service.js');
const { ApiError } = require('../utils/ApiError.js');
const {
  REWARD_TRANSACTION_TYPE,
  REWARD_DIRECTION,
  REFERRAL_STATUS,
} = require('../config/constants.js');

const ACTIVITY_FIELDS = [
  'key', 'title', 'description', 'currency', 'amount', 'claimMode', 'cooldownHours',
  'maxClaimsPerUser', 'startsAt', 'endsAt', 'active', 'sortOrder',
];
const CODE_FIELDS = [
  'code', 'label', 'currency', 'amount', 'active', 'startsAt', 'expiresAt',
  'maxRedemptions', 'perUserLimit',
];

const audit = (entry) => AuditLog.record(entry).catch(() => null);

function pickFields(body, fields) {
  const out = {};
  for (const f of fields) if (body[f] !== undefined) out[f] = body[f];
  return out;
}

function applyActivity(doc, body) {
  const values = pickFields(body, ACTIVITY_FIELDS);
  for (const [key, value] of Object.entries(values)) doc[key] = value;
  if (body.eligibility && typeof body.eligibility === 'object') {
    for (const [key, value] of Object.entries(body.eligibility)) {
      if (value !== undefined) doc.eligibility[key] = value;
    }
  }
  return doc;
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------
async function listActivities({ includeInactive = true } = {}) {
  const filter = includeInactive ? {} : { active: true };
  const activities = await RewardActivity.find(filter).sort({ sortOrder: 1, createdAt: 1 }).lean();
  const claimRows = await ActivityClaim.aggregate([
    { $group: { _id: '$activityId', claims: { $sum: 1 }, amount: { $sum: '$amount' } } },
  ]);
  const byId = new Map(claimRows.map((r) => [String(r._id), r]));

  return {
    items: activities.map((a) => {
      const stats = byId.get(String(a._id));
      return {
        id: String(a._id),
        ...a,
        stats: { claims: stats ? stats.claims : 0, credited: stats ? stats.amount : 0 },
      };
    }),
  };
}

async function createActivity({ body, actorUserId, requestId }) {
  const doc = new RewardActivity({ ...pickFields(body, ACTIVITY_FIELDS), createdBy: actorUserId });
  if (body.eligibility) applyActivity(doc, body).eligibility;
  try {
    await doc.save();
  } catch (err) {
    if (err && err.code === 11000) {
      throw new ApiError(409, 'REWARD_ACTIVITY_EXISTS', 'An activity with that key already exists.');
    }
    throw err;
  }
  await audit({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'reward.activity.create',
    entityType: 'RewardActivity',
    entityId: doc._id,
    after: { key: doc.key, title: doc.title, currency: doc.currency, amount: doc.amount },
    requestId,
  });
  return doc;
}

async function updateActivity({ activityId, body, actorUserId, requestId }) {
  const doc = await RewardActivity.findById(activityId);
  if (!doc) throw new ApiError(404, 'REWARD_ACTIVITY_NOT_FOUND', 'Reward activity not found.');
  const before = { currency: doc.currency, amount: doc.amount, active: doc.active, startsAt: doc.startsAt, endsAt: doc.endsAt };
  applyActivity(doc, body);
  doc.updatedBy = actorUserId;
  try {
    await doc.save();
  } catch (err) {
    if (err && err.code === 11000) {
      throw new ApiError(409, 'REWARD_ACTIVITY_EXISTS', 'An activity with that key already exists.');
    }
    throw err;
  }
  await audit({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'reward.activity.update',
    entityType: 'RewardActivity',
    entityId: doc._id,
    before,
    after: { currency: doc.currency, amount: doc.amount, active: doc.active, startsAt: doc.startsAt, endsAt: doc.endsAt },
    requestId,
  });
  return doc;
}

// ---------------------------------------------------------------------------
// Reward codes
// ---------------------------------------------------------------------------
async function listCodes() {
  const codes = await RewardCode.find({}).sort({ createdAt: -1 }).lean();
  return {
    items: codes.map((c) => ({
      ...c,
      id: String(c._id),
      remaining: c.maxRedemptions === null ? null : Math.max(0, c.maxRedemptions - c.redemptionCount),
    })),
  };
}

async function createCode({ body, actorUserId, requestId }) {
  const doc = new RewardCode({ ...pickFields(body, CODE_FIELDS), createdBy: actorUserId });
  try {
    await doc.save();
  } catch (err) {
    if (err && err.code === 11000) {
      throw new ApiError(409, 'REWARD_CODE_EXISTS', 'That reward code already exists.');
    }
    throw err;
  }
  await audit({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'reward.code.create',
    entityType: 'RewardCode',
    entityId: doc._id,
    after: { code: doc.code, currency: doc.currency, amount: doc.amount, maxRedemptions: doc.maxRedemptions },
    requestId,
  });
  return doc;
}

async function updateCode({ codeId, body, actorUserId, requestId }) {
  const doc = await RewardCode.findById(codeId);
  if (!doc) throw new ApiError(404, 'REWARD_CODE_NOT_FOUND', 'Reward code not found.');
  if (body.code !== undefined && body.code !== doc.code) {
    throw new ApiError(400, 'REWARD_CODE_IMMUTABLE', 'A reward code cannot be renamed. Create a new code instead.');
  }
  const before = { active: doc.active, amount: doc.amount, currency: doc.currency, maxRedemptions: doc.maxRedemptions };
  const values = pickFields(body, CODE_FIELDS);
  delete values.code;
  for (const [key, value] of Object.entries(values)) doc[key] = value;
  await doc.save();
  await audit({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'reward.code.update',
    entityType: 'RewardCode',
    entityId: doc._id,
    before,
    after: { active: doc.active, amount: doc.amount, currency: doc.currency, maxRedemptions: doc.maxRedemptions },
    requestId,
  });
  return doc;
}

/**
 * Generates unique codes server-side (CSPRNG). The batch is limited so a single
 * request cannot create an unbounded number of rows.
 */
async function generateCodes({ body, actorUserId, requestId }) {
  const count = body.count;
  const prefix = String(body.prefix || 'VELOOP').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const created = [];
  const label = body.label || 'Generated reward code';

  for (let i = 0; i < count; i += 1) {
    let code = null;
    for (let attempt = 0; attempt < 8 && !code; attempt += 1) {
      let suffix = '';
      for (let j = 0; j < 8; j += 1) suffix += alphabet[crypto.randomInt(0, alphabet.length)];
      const candidate = `${prefix}${suffix}`;
      const exists = await RewardCode.exists({ code: candidate });
      if (!exists) code = candidate;
    }
    if (!code) throw new Error('REWARD_CODE_GENERATION_FAILED');

    const doc = await RewardCode.create({
      code,
      label,
      currency: body.currency,
      amount: body.amount,
      active: true,
      maxRedemptions: body.maxRedemptions ?? 1,
      perUserLimit: body.perUserLimit ?? 1,
      expiresAt: body.expiresAt ?? null,
      createdBy: actorUserId,
    });
    created.push({ id: String(doc._id), code: doc.code, currency: doc.currency, amount: doc.amount });
  }

  await audit({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'reward.code.generate',
    entityType: 'RewardCode',
    entityId: created.map((c) => c.id).join(',').slice(0, 500),
    after: { count: created.length, currency: body.currency, amount: body.amount },
    requestId,
  });

  return { created };
}

async function codeRedemptions({ codeId, page = 1, limit = 20 }) {
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    CodeRedemption.find({ rewardCodeId: codeId })
      .sort({ lastRedeemedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'userId', select: 'publicAlias displayName' })
      .lean(),
    CodeRedemption.countDocuments({ rewardCodeId: codeId }),
  ]);
  return {
    items: rows.map((r) => ({
      id: String(r._id),
      member: r.userId?.publicAlias || r.userId?.displayName || null,
      userId: String(r.userId?._id || r.userId),
      code: r.code,
      currency: r.currency,
      amount: r.amount,
      count: r.count || 1,
      redeemedAt: r.lastRedeemedAt || r.createdAt,
    })),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/** Full redemption report for CSV export in the admin console. */
async function redemptionReport({ code, page = 1, limit = 100 }) {
  const filter = {};
  if (code) filter.code = String(code).toUpperCase();
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    CodeRedemption.find(filter)
      .sort({ lastRedeemedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'userId', select: 'publicAlias displayName' })
      .lean(),
    CodeRedemption.countDocuments(filter),
  ]);
  return {
    items: rows.map((r) => ({
      id: String(r._id),
      member: r.userId?.publicAlias || r.userId?.displayName || null,
      userId: String(r.userId?._id || r.userId),
      code: r.code,
      currency: r.currency,
      amount: r.amount,
      count: r.count || 1,
      balanceAfter: r.balanceAfter,
      redeemedAt: r.lastRedeemedAt || r.createdAt,
    })),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

// ---------------------------------------------------------------------------
// Wallets, adjustments and transactions
// ---------------------------------------------------------------------------
async function listWallets({ page = 1, limit = 20 }) {
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    RewardWallet.find({})
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'userId', select: 'publicAlias displayName email' })
      .lean(),
    RewardWallet.countDocuments({}),
  ]);
  return {
    items: rows.map((r) => ({
      id: String(r._id),
      member: r.userId?.publicAlias || r.userId?.displayName || null,
      userId: String(r.userId?._id || r.userId),
      balances: RewardWallet.balancesOf(r),
      updatedAt: r.updatedAt,
    })),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/**
 * Manual adjustment — the only admin path that moves a balance. It always writes
 * a ledger row with a reason, and a debit can never make a balance negative.
 */
async function adjustWallet({ userId, currency, amount, direction, reason, actorUserId, requestId }) {
  const user = await User.findById(userId).select('_id').lean();
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'Account not found.');

  const fn = direction === REWARD_DIRECTION.DEBIT ? ledger.debit : ledger.credit;
  const result = await fn({
    userId,
    currency,
    amount,
    type: REWARD_TRANSACTION_TYPE.ADMIN_ADJUSTMENT,
    description: reason,
    referenceType: 'AdminAdjustment',
    referenceId: String(actorUserId),
    idempotencyKey: `admin:${actorUserId}:${crypto.randomUUID()}`,
    requestId,
  });

  await audit({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'reward.wallet.adjust',
    entityType: 'RewardWallet',
    entityId: String(userId),
    after: { currency, amount, direction, reason, balanceAfter: result.balance },
    reason,
    requestId,
  });

  return { balances: await ledger.readBalances(userId), balance: result.balance };
}

async function listTransactions({ userId, type, currency, page = 1, limit = 20 }) {
  const filter = {};
  if (userId) filter.userId = userId;
  if (type) filter.type = type;
  if (currency) filter.currency = currency;
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    WalletTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'userId', select: 'publicAlias displayName' }),
    WalletTransaction.countDocuments(filter),
  ]);
  return {
    items: rows.map((r) => ({
      ...r.toClient(),
      member: r.userId?.publicAlias || r.userId?.displayName || null,
      userId: String(r.userId?._id || r.userId),
    })),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

async function stats() {
  const [walletCount, txCount, activityCount, pendingReferrals, codesRedeemed] = await Promise.all([
    RewardWallet.countDocuments({}),
    WalletTransaction.countDocuments({}),
    RewardActivity.countDocuments({ active: true }),
    Referral.countDocuments({ status: REFERRAL_STATUS.PENDING }),
    CodeRedemption.countDocuments({}),
  ]);
  return {
    wallets: walletCount,
    transactions: txCount,
    activeActivities: activityCount,
    pendingReferrals,
    codeRedemptions: codesRedeemed,
    asOf: new Date().toISOString(),
  };
}

module.exports = {
  listActivities,
  createActivity,
  updateActivity,
  listCodes,
  createCode,
  updateCode,
  generateCodes,
  codeRedemptions,
  redemptionReport,
  listWallets,
  adjustWallet,
  listTransactions,
  stats,
  getReferralConfig: referral.getConfig,
  updateReferralConfig: referral.updateConfig,
  listReferrals: referral.listReferrals,
  reviewReferral: referral.reviewReferral,
  ACTIVITY_FIELDS,
  CODE_FIELDS,
};
