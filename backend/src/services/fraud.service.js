/**
 * ============================================================================
 * FRAUD RISK SERVICE — a dedicated, configurable, CORROBORATED risk engine.
 * ============================================================================
 * Posture (all binding):
 *  - This is a HEURISTIC control, NOT a fraud guarantee. It never claims to be
 *    fraud-proof; thresholds are provisional defaults awaiting business approval.
 *  - It runs BEFORE any money moves and before any participation write, so a
 *    REJECT produces a generic 403 with zero side effects (no charge, no row).
 *  - A single device OR ip signal is NEVER conclusive: it can only FLAG. A REJECT
 *    needs `rejectMinSignals` DISTINCT categories, at least one of which is NOT a
 *    velocity (device/ip) hit — e.g. a device burst corroborated by repeated
 *    failed attempts or a participation-history burst.
 *  - Detection logic is never exposed to the caller; the only user-facing signal is
 *    the generic ENTRY_BLOCKED message raised by the caller. The rich detail stays
 *    on the server-side FraudEvent.
 *  - Claim submission and sensitive admin routes are NEVER auto-rejected here;
 *    `assessNonBlocking` only records evidence for the review queue.
 * ========================================================================= */
const { config } = require('../config/index.js');
const GiveawayParticipation = require('../models/giveawayParticipation.model.js');
const FraudEvent = require('../models/fraudEvent.model.js');
const {
  FRAUD_EVENT_TYPE,
  FRAUD_SEVERITY,
  PARTICIPATION_STATUS,
  RISK_DECISION,
  VELOCITY_FRAUD_TYPES,
} = require('../config/constants.js');

const ACTIVE_STATUSES = [PARTICIPATION_STATUS.PENDING, PARTICIPATION_STATUS.CONFIRMED];
const SECONDS = 1000;
const nowMs = (now) => (now instanceof Date ? now.getTime() : Date.now());

/** True when a measured `observed` value crosses its rule threshold. */
function crosses(observed, threshold) {
  return Number.isFinite(observed) && Number.isFinite(threshold) && observed >= threshold;
}

/**
 * PURE decision core — no DB, fully unit-testable.
 * ALLOW: no signals. REJECT: >= rejectMinSignals distinct categories AND at least
 * one non-velocity category. Otherwise FLAG_FOR_REVIEW (never reject a lone or a
 * device+ip-only pattern).
 */
function classifySignals({ signals = [], rejectMinSignals = 2 } = {}) {
  if (!signals.length) return RISK_DECISION.ALLOW;
  const distinct = new Set(signals.map((s) => s.type));
  const hasNonVelocity = signals.some((s) => !VELOCITY_FRAUD_TYPES.includes(s.type));
  if (distinct.size >= rejectMinSignals && hasNonVelocity) return RISK_DECISION.REJECT;
  return RISK_DECISION.FLAG_FOR_REVIEW;
}

// ---------------------------------------------------------------------------
// Signal evaluators (each returns a signal object only when it crosses).
// ---------------------------------------------------------------------------
async function evalDeviceVelocity(cfg, { giveawayId, deviceHash }) {
  if (!cfg.enabled || !deviceHash) return null;
  const distinct = (await GiveawayParticipation.distinct('userId', {
    giveawayId, 'deviceRef.deviceHash': deviceHash, status: { $in: ACTIVE_STATUSES },
  })).length;
  if (!crosses(distinct, cfg.threshold)) return null;
  return {
    type: FRAUD_EVENT_TYPE.DEVICE_VELOCITY, severity: cfg.severity, category: 'velocity',
    ruleKey: 'accounts_per_device_per_giveaway', metric: 'distinct_accounts',
    observed: distinct, threshold: cfg.threshold, windowSeconds: null,
  };
}

async function evalIpVelocity(cfg, { giveawayId, ipHash }) {
  if (!cfg.enabled || !ipHash) return null;
  const distinct = (await GiveawayParticipation.distinct('userId', {
    giveawayId, 'deviceRef.ipHash': ipHash, status: { $in: ACTIVE_STATUSES },
  })).length;
  if (!crosses(distinct, cfg.threshold)) return null;
  return {
    type: FRAUD_EVENT_TYPE.IP_VELOCITY, severity: cfg.severity, category: 'velocity',
    ruleKey: 'accounts_per_ip_per_giveaway', metric: 'distinct_accounts',
    observed: distinct, threshold: cfg.threshold, windowSeconds: null,
  };
}

async function evalDuplicateAttempts(cfg, { userId, now }) {
  if (!cfg.enabled || !userId) return null;
  const since = new Date(nowMs(now) - cfg.windowSec * SECONDS);
  const rows = await FraudEvent.find({
    userId,
    type: { $in: [FRAUD_EVENT_TYPE.DUPLICATE_ATTEMPT, FRAUD_EVENT_TYPE.REPEATED_FAILURE] },
    createdAt: { $gte: since },
  }).select('occurrenceCount').lean();
  const observed = rows.reduce((sum, r) => sum + (r.occurrenceCount || 1), 0);
  if (!crosses(observed, cfg.threshold)) return null;
  return {
    type: FRAUD_EVENT_TYPE.REPEATED_FAILURE, severity: cfg.severity, category: 'pattern',
    ruleKey: 'repeated_failed_participation', metric: 'duplicate_or_failed_attempts',
    observed, threshold: cfg.threshold, windowSeconds: cfg.windowSec,
  };
}

async function evalParticipationVelocity(cfg, { userId, now }) {
  if (!cfg.enabled || !userId) return null;
  const since = new Date(nowMs(now) - cfg.windowSec * SECONDS);
  const distinctGiveaways = (await GiveawayParticipation.distinct('giveawayId', {
    userId, joinedAt: { $gte: since },
  })).length;
  if (!crosses(distinctGiveaways, cfg.threshold)) return null;
  return {
    type: FRAUD_EVENT_TYPE.PARTICIPATION_VELOCITY, severity: cfg.severity, category: 'pattern',
    ruleKey: 'distinct_giveaways_joined_per_window', metric: 'distinct_giveaways',
    observed: distinctGiveaways, threshold: cfg.threshold, windowSeconds: cfg.windowSec,
  };
}

async function evalRequestFrequency(cfg, { userId, now }) {
  if (!cfg.enabled || !userId) return null;
  const since = new Date(nowMs(now) - cfg.windowSec * SECONDS);
  const observed = await GiveawayParticipation.countDocuments({ userId, joinedAt: { $gte: since } });
  if (!crosses(observed, cfg.threshold)) return null;
  return {
    type: FRAUD_EVENT_TYPE.BOT_PATTERN, severity: cfg.severity, category: 'pattern',
    ruleKey: 'join_attempts_per_user_per_window', metric: 'recent_entries',
    observed, threshold: cfg.threshold, windowSeconds: cfg.windowSec,
  };
}

function evalAccountAge(cfg, { user, now }) {
  if (!cfg.enabled || !cfg.minAgeSec || cfg.minAgeSec <= 0 || !user || !user.createdAt) return null;
  const ageSec = Math.max(0, (nowMs(now) - new Date(user.createdAt).getTime()) / SECONDS);
  if (ageSec >= cfg.minAgeSec) return null;
  return {
    // A brand-new account is a LOW corroborator only — never a sole basis.
    type: FRAUD_EVENT_TYPE.ACCOUNT_AGE, severity: cfg.severity, category: 'pattern',
    ruleKey: 'account_younger_than_min_age', metric: 'account_age_seconds',
    observed: Math.round(ageSec), threshold: cfg.minAgeSec, windowSeconds: null,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Evaluate the entry-risk rules for a prospective join. Read-only: it never
 * writes; recording is a separate, explicit step (so the caller controls ordering
 * relative to the money path).
 */
async function assessEntryRisk({ user, userId, giveawayId, deviceRef = {}, now = new Date() } = {}) {
  const cfg = config.security.fraud;
  if (!cfg.enabled) return { decision: RISK_DECISION.ALLOW, signals: [], rejectCorroborated: false, disabled: true };

  const context = { user, userId, giveawayId, deviceHash: deviceRef.deviceHash, ipHash: deviceRef.ipHash, now };
  const evaluators = [
    evalDeviceVelocity(cfg.deviceVelocity, context),
    evalIpVelocity(cfg.ipVelocity, context),
    evalDuplicateAttempts(cfg.duplicateAttempts, context),
    evalParticipationVelocity(cfg.participationVelocity, context),
    evalRequestFrequency(cfg.requestFrequency, context),
  ];
  const results = await Promise.all(evaluators);
  const signals = results.filter(Boolean);
  const accountAge = evalAccountAge(cfg.accountAge, context);
  if (accountAge) signals.push(accountAge);

  const decision = classifySignals({ signals, rejectMinSignals: cfg.rejectMinSignals });
  return { decision, signals, rejectCorroborated: decision === RISK_DECISION.REJECT };
}

/**
 * Persist the engine's evidence. ALLOW writes nothing. FLAG and REJECT record one
 * merged FraudEvent per signal; the action distinguishes "queued but proceeded"
 * from "blocked before any charge". Best-effort — evidence must never break a
 * legitimate join, so failures are swallowed by the caller's `.catch`.
 */
async function recordEntryDecision({ decision, signals = [], userId, giveawayId, deviceRef = {}, requestId } = {}) {
  if (!config.security.fraud.enabled) return null;
  if (decision !== RISK_DECISION.FLAG_FOR_REVIEW && decision !== RISK_DECISION.REJECT) return null;
  const actionTaken = decision === RISK_DECISION.REJECT ? 'ENTRY_BLOCKED' : 'FLAGGED';
  await Promise.all(signals.map((s) => FraudEvent.recordOrMerge({
    type: s.type,
    severity: s.severity,
    userId,
    giveawayId,
    deviceHash: deviceRef.deviceHash,
    ipHash: deviceRef.ipHash,
    clientClass: deviceRef.clientClass,
    requestId,
    actionTaken,
    signal: { ruleKey: s.ruleKey, metric: s.metric, observed: s.observed, threshold: s.threshold, windowSeconds: s.windowSeconds || undefined },
  })));
  return { actionTaken, recorded: signals.length };
}

/**
 * NON-BLOCKING abuse recorder for claim submission / admin / rate-limit bursts.
 * It only records evidence for the review queue; it never returns a decision and
 * never rejects. Enforcement for these surfaces stays with the rate limiters.
 */
async function assessNonBlocking({ surface = 'other', userId = null, giveawayId = null, deviceRef = {}, requestId = null, severity = FRAUD_SEVERITY.LOW, note = null } = {}) {
  if (!config.security.fraud.enabled) return null;
  const type = surface === 'rate_limit' ? FRAUD_EVENT_TYPE.BOT_PATTERN : FRAUD_EVENT_TYPE.REPEATED_FAILURE;
  return FraudEvent.recordOrMerge({
    type,
    severity,
    userId,
    giveawayId,
    deviceHash: deviceRef.deviceHash,
    ipHash: deviceRef.ipHash,
    requestId,
    actionTaken: 'RATE_LIMITED',
    signal: { ruleKey: `non_blocking_${surface}`, metric: 'occurrences', observed: 1 },
    ...(note ? { resolutionNote: String(note).slice(0, 500) } : {}),
  });
}

module.exports = {
  assessEntryRisk,
  recordEntryDecision,
  assessNonBlocking,
  classifySignals,
  crosses,
  RISK_DECISION,
};
