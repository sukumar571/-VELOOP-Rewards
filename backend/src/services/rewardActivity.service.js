/**
 * ============================================================================
 * REWARD ACTIVITY SERVICE — claimable, admin-configured earning activities.
 * ============================================================================
 * The server decides everything: which activities exist, what each is worth,
 * whether it is open, and whether THIS account may claim it. The client sends
 * only an activity id.
 *
 * Duplicate protection is structural, not a check: ActivityClaim has a unique
 * (userId, activityId, claimKey) index, and the claim row is written BEFORE the
 * wallet credit. A double-click therefore loses the index race and never credits.
 * ========================================================================= */
const RewardActivity = require('../models/rewardActivity.model.js');
const ActivityClaim = require('../models/activityClaim.model.js');
const User = require('../models/user.model.js');
const GiveawayParticipation = require('../models/giveawayParticipation.model.js');
const AuditLog = require('../models/auditLog.model.js');
const ledger = require('./rewardLedger.service.js');
const { domain } = require('../utils/domainErrors.js');
const { DEFAULT_ACTIVITIES } = require('../config/rewardProgram.js');
const { REWARD_TRANSACTION_TYPE } = require('../config/constants.js');

function dayKey(now) {
  return `day:${now.toISOString().slice(0, 10)}`;
}

function claimKeyFor(activity, now) {
  if (activity.claimMode === 'DAILY') return dayKey(now);
  if (activity.claimMode === 'COOLDOWN') {
    const bucket = Math.floor(now.getTime() / (activity.cooldownHours * 3600_000));
    return `cd:${bucket}`;
  }
  return 'once';
}

/** Inserts the backend defaults only when no activity has ever been created. */
async function ensureDefaults() {
  const count = await RewardActivity.estimatedDocumentCount();
  if (count > 0) return;
  await RewardActivity.insertMany(DEFAULT_ACTIVITIES.map((a) => ({ ...a }))).catch((err) => {
    // A concurrent first request may win the unique key race; that is fine.
    if (!err || err.code !== 11000) throw err;
  });
}

async function eligibilityOf({ userId, activity, now }) {
  const user = await User.findById(userId).select('createdAt kyc.status').lean();
  if (!user) throw domain('ACCOUNT_NOT_ACTIVE');

  if (activity.eligibility.minAccountAgeHours > 0) {
    const ageHours = (now.getTime() - new Date(user.createdAt).getTime()) / 3600_000;
    if (ageHours < activity.eligibility.minAccountAgeHours) {
      return {
        eligible: false,
        reason: 'ACCOUNT_TOO_NEW',
        detail: `Available ${activity.eligibility.minAccountAgeHours}h after registration.`,
      };
    }
  }
  if (activity.eligibility.kycStatus === 'VERIFIED' && user.kyc?.status !== 'VERIFIED') {
    return { eligible: false, reason: 'KYC_REQUIRED', detail: 'Verified identity required.' };
  }
  if (activity.eligibility.requireParticipation) {
    const participated = await GiveawayParticipation.exists({ userId });
    if (!participated) {
      return { eligible: false, reason: 'PARTICIPATION_REQUIRED', detail: 'Enter a giveaway first.' };
    }
  }
  return { eligible: true, reason: null, detail: null };
}

/**
 * The catalogue for the signed-in member, with availability, eligibility, claim
 * counts and the amount taken from stored configuration.
 */
async function listForUser({ userId }) {
  await ensureDefaults();
  const now = new Date();
  const activities = await RewardActivity.find({}).sort({ sortOrder: 1, createdAt: 1 }).lean();
  const claims = await ActivityClaim.find({ userId }).select('activityId claimKey').lean();

  const claimedByActivity = new Map();
  for (const c of claims) {
    const key = String(c.activityId);
    claimedByActivity.set(key, (claimedByActivity.get(key) || 0) + 1);
  }

  const items = [];
  for (const activity of activities) {
    const availability = RewardActivity.hydrate(activity).availability(now);
    const eligibility = availability.open
      ? await eligibilityOf({ userId, activity, now })
      : { eligible: false, reason: availability.reason, detail: null };
    const claimed = claimedByActivity.get(String(activity._id)) || 0;
    const claimKey = claimKeyFor(activity, now);
    const claimedThisPeriod = claims.some(
      (c) => String(c.activityId) === String(activity._id) && c.claimKey === claimKey,
    );
    const limitReached = claimed >= activity.maxClaimsPerUser;

    items.push({
      id: String(activity._id),
      key: activity.key,
      title: activity.title,
      description: activity.description,
      currency: activity.currency,
      amount: activity.amount,
      claimMode: activity.claimMode,
      cooldownHours: activity.claimMode === 'COOLDOWN' ? activity.cooldownHours : null,
      startsAt: activity.startsAt,
      endsAt: activity.endsAt,
      active: activity.active,
      eligibility: {
        eligible: eligibility.eligible && !limitReached && !claimedThisPeriod,
        reason: limitReached ? 'LIMIT_REACHED' : claimedThisPeriod ? 'ALREADY_CLAIMED' : eligibility.reason,
        detail: eligibility.detail,
        minAccountAgeHours: activity.eligibility.minAccountAgeHours,
        requireParticipation: activity.eligibility.requireParticipation,
      },
      claim: {
        claimed,
        limit: activity.maxClaimsPerUser,
        remaining: Math.max(0, activity.maxClaimsPerUser - claimed),
        claimedThisPeriod,
      },
      available: availability.open,
      availabilityReason: availability.reason,
    });
  }

  return { items };
}

/** Claims one activity once for the current period and credits its reward. */
async function claim({ userId, activityId, requestId }) {
  const now = new Date();
  const activity = await RewardActivity.findById(activityId);
  if (!activity) throw domain('REWARD_ACTIVITY_NOT_FOUND');

  const availability = activity.availability(now);
  if (!availability.open) {
    if (availability.reason === 'EXPIRED') throw domain('REWARD_ACTIVITY_EXPIRED');
    if (availability.reason === 'NOT_STARTED') throw domain('REWARD_ACTIVITY_NOT_STARTED');
    throw domain('REWARD_ACTIVITY_INACTIVE');
  }

  const eligibility = await eligibilityOf({ userId, activity, now });
  if (!eligibility.eligible) {
    throw domain('REWARD_NOT_ELIGIBLE', undefined, {
      reason: eligibility.reason,
      detail: eligibility.detail,
    });
  }

  const claimedCount = await ActivityClaim.countDocuments({ userId, activityId: activity._id });
  if (claimedCount >= activity.maxClaimsPerUser) throw domain('REWARD_CLAIM_LIMIT_REACHED');

  let claimDoc;
  try {
    claimDoc = await ActivityClaim.create({
      userId,
      activityId: activity._id,
      claimKey: claimKeyFor(activity, now),
      currency: activity.currency,
      amount: activity.amount,
    });
  } catch (err) {
    if (err && err.code === 11000) throw domain('REWARD_ALREADY_CLAIMED');
    throw err;
  }

  let credited;
  try {
    credited = await ledger.credit({
      userId,
      currency: activity.currency,
      amount: activity.amount,
      type: REWARD_TRANSACTION_TYPE.ACTIVITY_REWARD,
      description: activity.title,
      referenceType: 'RewardActivity',
      referenceId: String(activity._id),
      idempotencyKey: `activity:${claimDoc._id}`,
      requestId,
    });
  } catch (err) {
    // Nothing landed in the wallet: release the claim so it can be retried.
    await ActivityClaim.deleteOne({ _id: claimDoc._id }).catch(() => null);
    throw err;
  }

  claimDoc.transactionId = credited.transaction ? credited.transaction._id : null;
  await claimDoc.save().catch(() => null);

  await AuditLog.record({
    actorId: userId,
    actorRole: 'user',
    action: 'reward.activity.claim',
    entityType: 'RewardActivity',
    entityId: activity._id,
    after: { currency: activity.currency, amount: activity.amount, balanceAfter: credited.balance },
    requestId,
  }).catch(() => null);

  return {
    activityId: String(activity._id),
    title: activity.title,
    currency: activity.currency,
    amount: activity.amount,
    balance: credited.balance,
  };
}

/** Admin: claim history for one activity (who / when / how much). */
async function claimHistory({ activityId, page = 1, limit = 20 }) {
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    ActivityClaim.find({ activityId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'userId', select: 'displayName publicAlias' })
      .lean(),
    ActivityClaim.countDocuments({ activityId }),
  ]);
  return {
    items: rows.map((r) => ({
      id: String(r._id),
      userId: String(r.userId?._id || r.userId),
      member: r.userId?.publicAlias || r.userId?.displayName || null,
      currency: r.currency,
      amount: r.amount,
      status: r.status,
      createdAt: r.createdAt,
    })),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

module.exports = { ensureDefaults, listForUser, claim, claimHistory, eligibilityOf };
