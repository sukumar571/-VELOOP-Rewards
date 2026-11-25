/**
 * ============================================================================
 * REFERRAL SERVICE — record, qualify and reward referrals.
 * ============================================================================
 * Rules encoded here (all enforced server-side):
 *   • one account can be referred ONCE (unique refereeId), so duplicates and
 *     circular chains cannot pay out twice;
 *   • self-referral is refused explicitly;
 *   • a referral is PENDING until the configured qualification rules are met —
 *     opening a link or merely registering rewards nothing on its own;
 *   • the reward amount and currency come from stored config, never the client;
 *   • the credited movement carries `referral:<id>:<role>` as its idempotency
 *     key, so re-evaluating a referral can never credit a second time;
 *   • an administrator can approve or reject a referral from the admin console.
 * ========================================================================= */
const crypto = require('crypto');
const User = require('../models/user.model.js');
const Referral = require('../models/referral.model.js');
const SystemSetting = require('../models/systemSetting.model.js');
const GiveawayParticipation = require('../models/giveawayParticipation.model.js');
const AuditLog = require('../models/auditLog.model.js');
const ledger = require('./rewardLedger.service.js');
const { domain } = require('../utils/domainErrors.js');
const { REFERRAL_SETTING_KEY, DEFAULT_REFERRAL_CONFIG } = require('../config/rewardProgram.js');
const {
  REFERRAL_STATUS,
  REWARD_TRANSACTION_TYPE,
  CURRENCIES,
} = require('../config/constants.js');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function normalizeCode(raw) {
  return String(raw ?? '').trim().toUpperCase();
}

/** Deep-merges a stored config over the defaults, dropping unknown shapes. */
function normalizeConfig(stored) {
  const v = stored && typeof stored === 'object' ? stored : {};
  const reward = (r) => {
    if (!r || typeof r !== 'object') return null;
    const amount = Number(r.amount);
    const currency = String(r.currency || '').toUpperCase();
    if (!CURRENCIES.includes(currency) || !Number.isInteger(amount) || amount < 1) return null;
    return { currency, amount };
  };
  const q = v.qualification && typeof v.qualification === 'object' ? v.qualification : {};
  const minAge = Number(q.minAccountAgeHours);
  const maxReferrals = Number(v.maxReferralsPerUser);
  return {
    enabled: v.enabled === undefined ? DEFAULT_REFERRAL_CONFIG.enabled : Boolean(v.enabled),
    referrerReward:
      reward(v.referrerReward) || { ...DEFAULT_REFERRAL_CONFIG.referrerReward },
    refereeReward: reward(v.refereeReward),
    qualification: {
      minAccountAgeHours: Number.isFinite(minAge) && minAge >= 0 ? minAge : 24,
      requireParticipation: Boolean(q.requireParticipation),
      autoApprove:
        q.autoApprove === undefined
          ? DEFAULT_REFERRAL_CONFIG.qualification.autoApprove
          : Boolean(q.autoApprove),
    },
    maxReferralsPerUser:
      Number.isInteger(maxReferrals) && maxReferrals >= 1 ? maxReferrals : 100,
  };
}

async function getConfig() {
  const row = await SystemSetting.findOne({ key: REFERRAL_SETTING_KEY }).lean();
  return normalizeConfig(row ? row.value : DEFAULT_REFERRAL_CONFIG);
}

async function updateConfig(value, { actorUserId } = {}) {
  const normalized = normalizeConfig(value);
  await SystemSetting.findOneAndUpdate(
    { key: REFERRAL_SETTING_KEY },
    {
      $set: { value: normalized, description: 'Referral program configuration', updatedBy: actorUserId, updatedAt: new Date() },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await AuditLog.record({
    actorId: actorUserId || 'system',
    actorRole: 'admin',
    action: 'reward.referral.config.update',
    entityType: 'SystemSetting',
    entityId: REFERRAL_SETTING_KEY,
    after: normalized,
  }).catch(() => null);
  return normalized;
}

/** Generates a unique, human-readable referral code for an account. */
async function ensureReferralCode(user) {
  if (!user) return null;
  if (user.referralCode) return user.referralCode;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    let suffix = '';
    for (let i = 0; i < 6; i += 1) suffix += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
    const code = `VL${suffix}`;
    try {
      const updated = await User.findOneAndUpdate(
        { _id: user._id, $or: [{ referralCode: null }, { referralCode: { $exists: false } }] },
        { $set: { referralCode: code } },
        { new: true },
      );
      if (updated && updated.referralCode) return updated.referralCode;
      // Another request may have set it concurrently.
      const current = await User.findById(user._id).select('referralCode').lean();
      if (current && current.referralCode) return current.referralCode;
    } catch (err) {
      if (!err || err.code !== 11000) throw err;
    }
  }
  throw new Error('REFERRAL_CODE_GENERATION_FAILED');
}

/**
 * Records the referral for a NEW account. Called during signup, so failures are
 * surfaced to the caller (an invalid code is a validation error, not a silent
 * no-op). Returns null when no code was supplied.
 */
async function createForNewUser({ referee, referralCode, requestId }) {
  const code = normalizeCode(referralCode);
  if (!code) return null;

  const referrer = await User.findOne({ referralCode: code }).select('_id email referralCode').lean();
  if (!referrer) throw domain('REFERRAL_INVALID_CODE');
  if (String(referrer._id) === String(referee._id)) throw domain('REFERRAL_SELF');

  const alreadyReferred = await Referral.exists({ refereeId: referee._id });
  if (alreadyReferred) throw domain('REFERRAL_DUPLICATE');

  const config = await getConfig();
  const total = await Referral.countDocuments({ referrerId: referrer._id });
  if (total >= config.maxReferralsPerUser) throw domain('REFERRAL_LIMIT_REACHED');

  const referral = await Referral.create({
    referrerId: referrer._id,
    refereeId: referee._id,
    code,
    status: REFERRAL_STATUS.PENDING,
  });
  await User.updateOne({ _id: referee._id }, { $set: { referredBy: referrer._id } }).catch(() => null);

  await AuditLog.record({
    actorId: referee._id,
    actorRole: 'user',
    action: 'reward.referral.record',
    entityType: 'Referral',
    entityId: referral._id,
    after: { code, status: referral.status },
    requestId,
  }).catch(() => null);

  return referral;
}

function qualifies(referee, config, now) {
  const { qualification } = config;
  const ageHours = (now.getTime() - new Date(referee.createdAt).getTime()) / 3600_000;
  if (ageHours < qualification.minAccountAgeHours) return false;
  return true;
}

/**
 * Credits the configured rewards and marks the referral QUALIFIED. Idempotent:
 * the wallet keys are derived from the referral id and role.
 */
async function qualifyReferral({ referral, config, actorUserId, note, requestId }) {
  const credited = [];
  const rewards = [];

  const roles = [
    { role: 'REFERRER', userId: referral.referrerId, reward: config.referrerReward },
    { role: 'REFEREE', userId: referral.refereeId, reward: config.refereeReward },
  ];

  for (const entry of roles) {
    if (!entry.reward) continue;
    const result = await ledger.credit({
      userId: entry.userId,
      currency: entry.reward.currency,
      amount: entry.reward.amount,
      type: REWARD_TRANSACTION_TYPE.REFERRAL_REWARD,
      description: `Referral ${entry.role.toLowerCase()} reward`,
      referenceType: 'Referral',
      referenceId: String(referral._id),
      idempotencyKey: `referral:${referral._id}:${entry.role.toLowerCase()}`,
      requestId,
    });
    const txnId = result.transaction ? result.transaction._id : null;
    rewards.push({
      userId: entry.userId,
      role: entry.role,
      currency: entry.reward.currency,
      amount: entry.reward.amount,
      transactionId: txnId,
    });
    credited.push({ ...entry, balance: result.balance });
  }

  referral.status = REFERRAL_STATUS.QUALIFIED;
  referral.qualifiedAt = new Date();
  referral.rewards = rewards;
  referral.reviewedBy = actorUserId || null;
  referral.reviewedAt = actorUserId ? new Date() : null;
  referral.note = note ? String(note).slice(0, 300) : referral.note;
  await referral.save();

  await AuditLog.record({
    actorId: actorUserId || 'system',
    actorRole: actorUserId ? 'admin' : 'system',
    action: 'reward.referral.qualify',
    entityType: 'Referral',
    entityId: referral._id,
    after: { status: referral.status, rewards: rewards.map((r) => ({ role: r.role, currency: r.currency, amount: r.amount })) },
    requestId,
  }).catch(() => null);

  return { referral, credited };
}

/**
 * Evaluates the referrer's PENDING referrals and qualifies the ones whose
 * referee now satisfies the rules. Called on every referral-page read, so a
 * referral matures without a background worker and without a client claiming it.
 */
async function evaluatePending({ referrerId, requestId }) {
  const config = await getConfig();
  if (!config.enabled) return { qualified: 0 };

  const pending = await Referral.find({ referrerId, status: REFERRAL_STATUS.PENDING });
  if (!pending.length) return { qualified: 0 };

  const now = new Date();
  let qualified = 0;
  for (const referral of pending) {
    const referee = await User.findById(referral.refereeId).select('createdAt').lean();
    if (!referee || !qualifies(referee, config, now)) continue;

    if (config.qualification.requireParticipation) {
      const participated = await GiveawayParticipation.exists({ userId: referral.refereeId });
      if (!participated) continue;
    }
    if (!config.qualification.autoApprove) continue;

    try {
      await qualifyReferral({ referral, config, requestId });
      qualified += 1;
    } catch (err) {
      // Leave it pending: qualification can be retried on the next read.
      continue;
    }
  }
  return { qualified };
}

/** The signed-in member's referral dashboard. */
async function overview({ userId, requestId, originPath = '/login' }) {
  const user = await User.findById(userId);
  if (!user) throw domain('ACCOUNT_NOT_ACTIVE');
  const code = await ensureReferralCode(user);
  await evaluatePending({ referrerId: userId, requestId });

  const config = await getConfig();
  const rows = await Referral.find({ referrerId: userId })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate({ path: 'refereeId', select: 'publicAlias displayName createdAt' })
    .lean();

  const counts = { total: rows.length, pending: 0, qualified: 0, rejected: 0 };
  for (const r of rows) {
    if (r.status === REFERRAL_STATUS.PENDING) counts.pending += 1;
    else if (r.status === REFERRAL_STATUS.QUALIFIED) counts.qualified += 1;
    else counts.rejected += 1;
  }

  return {
    code,
    link: `${originPath}?ref=${code}`,
    enabled: config.enabled,
    reward: config.referrerReward,
    refereeReward: config.refereeReward,
    qualification: config.qualification,
    counts,
    referrals: rows.map((r) => ({
      id: String(r._id),
      member: r.refereeId?.publicAlias || r.refereeId?.displayName || 'Member',
      status: r.status,
      joinedAt: r.refereeId?.createdAt || r.createdAt,
      qualifiedAt: r.qualifiedAt,
      rewards: (r.rewards || []).map((x) => ({
        role: x.role,
        currency: x.currency,
        amount: x.amount,
      })),
    })),
    rewardHistory: rows
      .filter((r) => r.status === REFERRAL_STATUS.QUALIFIED)
      .flatMap((r) =>
        (r.rewards || [])
          .filter((x) => String(x.userId) === String(userId))
          .map((x) => ({
            referralId: String(r._id),
            currency: x.currency,
            amount: x.amount,
            at: r.qualifiedAt || r.updatedAt,
          })),
      ),
  };
}

/** Admin: paginated referral records with the parties involved. */
async function listReferrals({ status, page = 1, limit = 20 } = {}) {
  const filter = {};
  if (status) filter.status = status;
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    Referral.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'referrerId', select: 'publicAlias displayName' })
      .populate({ path: 'refereeId', select: 'publicAlias displayName createdAt' })
      .lean(),
    Referral.countDocuments(filter),
  ]);
  return {
    items: rows.map((r) => ({
      id: String(r._id),
      code: r.code,
      status: r.status,
      referrer: r.referrerId?.publicAlias || r.referrerId?.displayName || String(r.referrerId),
      referee: r.refereeId?.publicAlias || r.refereeId?.displayName || String(r.refereeId),
      createdAt: r.createdAt,
      qualifiedAt: r.qualifiedAt,
      rewards: (r.rewards || []).map((x) => ({ role: x.role, currency: x.currency, amount: x.amount })),
      note: r.note,
    })),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/** Admin decision: APPROVE qualifies (bypassing the age rule), REJECT closes it. */
async function reviewReferral({ referralId, decision, note, actorUserId, requestId }) {
  const referral = await Referral.findById(referralId);
  if (!referral) throw domain('REFERRAL_NOT_FOUND');
  if (referral.status !== REFERRAL_STATUS.PENDING) throw domain('REFERRAL_ALREADY_DECIDED');

  if (decision === 'REJECT') {
    referral.status = REFERRAL_STATUS.REJECTED;
    referral.reviewedBy = actorUserId;
    referral.reviewedAt = new Date();
    referral.note = note ? String(note).slice(0, 300) : 'Rejected by an administrator.';
    await referral.save();
    await AuditLog.record({
      actorId: actorUserId,
      actorRole: 'admin',
      action: 'reward.referral.reject',
      entityType: 'Referral',
      entityId: referral._id,
      after: { status: referral.status, note: referral.note },
      requestId,
    }).catch(() => null);
    return { status: referral.status };
  }

  const config = await getConfig();
  const { referral: updated } = await qualifyReferral({
    referral,
    config,
    actorUserId,
    note,
    requestId,
  });
  return { status: updated.status, rewards: updated.rewards };
}

module.exports = {
  getConfig,
  updateConfig,
  normalizeConfig,
  ensureReferralCode,
  createForNewUser,
  evaluatePending,
  overview,
  listReferrals,
  reviewReferral,
  qualifyReferral,
};
