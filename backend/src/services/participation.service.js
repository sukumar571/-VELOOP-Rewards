/**
 * ============================================================================
 * PARTICIPATION SERVICE — the entry path (the only place money can move).
 * ============================================================================
 * Order of operations is a correctness decision, not a style preference:
 *
 *   1. Re-validate the draw is open (server clock, not the client's).
 *   2. Evaluate eligibility rules from configuration.
 *   3. Resolve the fee from configuration (`Prize.resolveFee`) — never a literal.
 *   4. Create the participation row FIRST, in status PENDING. Its unique index on
 *      (userId, giveawayId) is the double-entry lock: two concurrent submits can
 *      both pass step 1, but only one can create the row.
 *   5. Only then charge. A failed charge removes the never-charged PENDING row
 *      (the model allows exactly that) so the user may retry; a charge that did
 *      settle is never removed, and a completed ledger row is never edited into a
 *      refund — that would be a compensating REVERSAL row (see `voidParticipation`).
 *
 * Balance reads happen before the debit so a broke account gets the documented
 * 402 `INSUFFICIENT_BALANCE` instead of a provider error it cannot interpret.
 * The wallet adapter is the only source of balance truth; `WalletReference` rows
 * are cached observations, always paired with `observedAt` + `source`.
 * ========================================================================= */
const mongoose = require('mongoose');
const Giveaway = require('../models/giveaway.model.js');
const Prize = require('../models/prize.model.js');
const Participation = require('../models/giveawayParticipation.model.js');
const Ledger = require('../models/giveawayEntryTransaction.model.js');
const User = require('../models/user.model.js');
const WalletReference = require('../models/walletReference.model.js');
const FraudEvent = require('../models/fraudEvent.model.js');
const GiveawayWinner = require('../models/giveawayWinner.model.js');
const PrizeClaim = require('../models/prizeClaim.model.js');
const IdempotencyKey = require('../models/idempotencyKey.model.js');
const AuditLog = require('../models/auditLog.model.js');
const wallet = require('../integrations/veloopWallet.js');
const eligibility = require('./eligibility.service.js');
const fraud = require('./fraud.service.js');
const { supportsTransactions, withTransaction } = require('../config/db.js');
const { domain } = require('../utils/domainErrors.js');
const { ApiError } = require('../utils/ApiError.js');
const { buildDeviceRef, hasClientReference } = require('../utils/deviceRef.js');
const { config } = require('../config/index.js');
const {
  PARTICIPATION_STATUS,
  GIVEAWAY_STATUS,
  FRAUD_EVENT_TYPE,
  FRAUD_SEVERITY,
  RISK_DECISION,
  TRANSACTION_TYPE,
  TRANSACTION_STATUS,
  WALLET_SOURCE,
} = require('../config/constants.js');

/** Fields of a participation that are safe to hand back to its own owner. */
const OWNER_PROJECTION = 'giveawayId prizeId entryCurrency entryAmount entryCount status joinedAt rulesVersion transactionId';

// ---------------------------------------------------------------------------
// Gate checks
// ---------------------------------------------------------------------------
/** Lifecycle + publication, judged on the server clock. */
function assertEntryWindow(giveaway, now = new Date()) {
  if (!giveaway.published) throw domain('GIVEAWAY_NOT_FOUND');
  if (giveaway.status === GIVEAWAY_STATUS.ARCHIVED || giveaway.status === GIVEAWAY_STATUS.ENDED) {
    throw domain('GIVEAWAY_ENDED');
  }
  if (giveaway.status === GIVEAWAY_STATUS.UPCOMING && now < giveaway.startAt) {
    throw domain('GIVEAWAY_NOT_STARTED', undefined, { startAt: giveaway.startAt });
  }
  if (!giveaway.isOpenForEntries(now)) {
    const graceMs = (giveaway.participation.entryCloseGraceSeconds || 0) * 1000;
    throw domain(now > new Date(giveaway.endAt.getTime() + graceMs) ? 'GIVEAWAY_ENDED' : 'GIVEAWAY_NOT_ACTIVE', undefined, {
      status: giveaway.status,
      endAt: giveaway.endAt,
    });
  }
  return true;
}

/** Per-user / per-prize caps, all read from configuration. */
async function assertEntryQuota(giveaway, prize, { userId, entries, now }) {
  const p = giveaway.participation;
  const max = p.maxEntriesPerUser;
  if (Number.isFinite(max) && entries > max) {
    throw domain('ENTRY_LIMIT_REACHED', undefined, { maxEntriesPerUser: max, requested: entries });
  }

  if (Number.isFinite(p.maxEntriesPerUserPerDay)) {
    const dayStart = new Date(now.getTime()); dayStart.setUTCHours(0, 0, 0, 0);
    const usedToday = await Participation.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(String(userId)), giveawayId: giveaway._id, joinedAt: { $gte: dayStart } } },
      { $group: { _id: null, total: { $sum: '$entryCount' } } },
    ]);
    const today = (usedToday[0] && usedToday[0].total) || 0;
    if (today + entries > p.maxEntriesPerUserPerDay) {
      throw domain('ENTRY_LIMIT_REACHED', undefined, { maxEntriesPerUserPerDay: p.maxEntriesPerUserPerDay, usedToday: today });
    }
  }

  if (Number.isFinite(prize.maxEntries)) {
    const used = await Participation.aggregate([
      { $match: { giveawayId: giveaway._id, prizeId: prize._id } },
      { $group: { _id: null, total: { $sum: '$entryCount' } } },
    ]);
    const taken = (used[0] && used[0].total) || 0;
    if (taken + entries > prize.maxEntries) {
      throw domain('ENTRY_LIMIT_REACHED', undefined, { prizeMaxEntries: prize.maxEntries, alreadyEntered: taken });
    }
  }
  return true;
}

/**
 * Picks the tier to enter and prices it. A draw with exactly one active tier needs
 * no `prizeId`; more than one must be chosen explicitly, because silently taking
 * the first tier would charge the wrong fee.
 */
async function resolveEntryTarget({ giveawayId, prizeId, currency, entries }) {
  const giveaway = await Giveaway.findById(giveawayId);
  if (!giveaway) throw domain('GIVEAWAY_NOT_FOUND');

  const active = await Prize.find({ giveawayId: giveaway._id, active: true }).sort({ position: 1 });
  if (!active.length) throw domain('PRIZE_NOT_AVAILABLE');

  let prize;
  if (prizeId) {
    prize = active.find((pr) => String(pr._id) === String(prizeId));
    if (!prize) {
      const exists = await Prize.findById(prizeId).lean();
      throw exists ? domain('PRIZE_MISMATCH') : domain('PRIZE_NOT_AVAILABLE');
    }
  } else if (active.length === 1) {
    prize = active[0];
  } else {
    throw domain('PRIZE_SELECTION_REQUIRED', undefined, {
      prizeIds: active.map((pr) => String(pr._id)),
    });
  }

  Participation.assertPrizeInGiveaway(giveaway._id, prize);
  Prize.assertMatchesGiveaway(giveaway, prize);

  let fee;
  try {
    fee = Prize.resolveFee(prize, currency);
  } catch (err) {
    if (err.code === 'ENTRY_CURRENCY_NOT_ALLOWED') throw domain(err.code, undefined, { currency: err.currency });
    throw err;
  }
  if (!(giveaway.participation.entryCurrencies || []).includes(fee.currency)) {
    throw domain('ENTRY_CURRENCY_NOT_ALLOWED', undefined, {
      currency: fee.currency,
      allowed: giveaway.participation.entryCurrencies,
    });
  }

  const free = Math.min(entries, giveaway.participation.freeEntryCount || 0);
  const paid = entries - free;
  return { giveaway, prize, fee, free, paid, amount: fee.amount * paid };
}

// ---------------------------------------------------------------------------
// Wallet interaction
// ---------------------------------------------------------------------------
/** Cached/observed balance for one user+currency, with the provider re-read when stale. */
async function observeBalance(userId, currency, { forceRefresh = false } = {}) {
  const cached = await WalletReference.findOne({ userId, currency });
  if (!forceRefresh && cached && cached.isFresh(config.wallet.snapshotMaxAgeSeconds)) {
    return { balance: cached.balance, cached: true, observedAt: cached.observedAt, source: cached.source };
  }
  if (!wallet.isConfigured()) {
    if (cached) return { balance: cached.balance, cached: true, stale: true, observedAt: cached.observedAt, source: cached.source };
    throw domain('WALLET_NOT_CONFIGURED');
  }
  try {
    const fresh = await wallet.getBalance({ userId, currency });
    await WalletReference.recordSnapshot(fresh, { isProduction: config.isProduction });
    return { ...fresh, cached: false };
  } catch (err) {
    await WalletReference.markStale(userId, currency, err.code || 'WALLET_ERROR');
    throw err;
  }
}

/**
 * Charges one entry fee and writes the ledger row around it.
 * Returns the settled (or honestly still-PENDING) ledger document.
 */
async function chargeEntry({ giveaway, prize, participation, fee, amount, requestId, clientClass, idempotencyKey: clientKey }) {
  // With a client `Idempotency-Key`, a genuine retry must map to the SAME provider
  // key (that is what makes the external debit idempotent); without one, fall back
  // to a per-participation key that the participation unique index already pins.
  const idempotencyKey = ledgerIdempotencyKey({ clientKey, participationId: participation._id, entries: participation.entryCount });
  const row = await Ledger.create({
    userId: participation.userId,
    giveawayId: giveaway._id,
    prizeId: prize._id,
    participationId: participation._id,
    currency: fee.currency,
    amount,
    direction: Ledger.DIRECTION.DEBIT,
    type: TRANSACTION_TYPE.ENTRY_FEE,
    status: TRANSACTION_STATUS.PENDING,
    idempotencyKey,
    entriesGranted: participation.entryCount,
    sourceEndpoint: 'POST /api/v1/giveaways/:id/join',
    clientClass,
    requestId,
  });

  const settle = async (patch) => {
    Object.assign(row, patch);
    return row.save();
  };

  // 1) Balance gate — produces the documented 402 rather than a provider surprise.
  let observed;
  try {
    observed = await observeBalance(participation.userId, fee.currency, { forceRefresh: true });
  } catch (err) {
    await settle({ status: TRANSACTION_STATUS.FAILED, failureReason: err.code || 'BALANCE_CHECK_FAILED' });
    throw err;
  }
  if (typeof observed.balance !== 'number' || observed.balance < amount) {
    await settle({ status: TRANSACTION_STATUS.FAILED, failureReason: 'INSUFFICIENT_BALANCE', balanceBefore: observed.balance });
    throw domain('INSUFFICIENT_BALANCE', undefined, {
      currency: fee.currency,
      required: amount,
      available: typeof observed.balance === 'number' ? observed.balance : null,
    });
  }

  // 2) The debit itself.
  let result;
  try {
    result = await wallet.debit({
      userId: participation.userId,
      currency: fee.currency,
      amount,
      idempotencyKey,
      reference: `giveaway:${giveaway._id}:participation:${participation._id}`,
    });
  } catch (err) {
    await settle({ status: TRANSACTION_STATUS.FAILED, failureReason: err.code || 'DEBIT_FAILED' });
    throw domain('ENTRY_CHARGE_FAILED', undefined, { transactionId: row.transactionId, reason: err.code || 'DEBIT_FAILED' });
  }

  // 3) Only a provider reference lets us call the charge settled. A 2xx without
  //    one stays PENDING (the reconciliation index finds it) but the entry is
  //    honoured, because the money did move.
  const settled = Boolean(result.externalTransactionId);
  const balanceBefore = typeof result.balanceBefore === 'number' ? result.balanceBefore : observed.balance;
  const balanceAfter = typeof result.balanceAfter === 'number' ? result.balanceAfter : null;
  try {
    return await settle({
      status: settled ? TRANSACTION_STATUS.SUCCESS : TRANSACTION_STATUS.PENDING,
      externalTransactionId: result.externalTransactionId || null,
      balanceBefore,
      balanceAfter,
      failureReason: settled ? null : 'PROVIDER_REFERENCE_MISSING',
      completedAt: settled ? new Date() : null,
    });
  } catch (err) {
    // The model refuses to store balance figures that do not reconcile. That is
    // the right call for the ledger, but the capture itself already happened — so
    // keep the settled row and drop the provider's inconsistent snapshot instead
    // of failing the entry the user has genuinely paid for.
    if (settled && err && err.name === 'ValidationError') {
      return settle({
        status: TRANSACTION_STATUS.SUCCESS,
        externalTransactionId: result.externalTransactionId,
        balanceBefore: null,
        balanceAfter: null,
        failureReason: 'PROVIDER_BALANCE_INCONSISTENT',
        completedAt: new Date(),
      });
    }
    throw err;
  }
}

/** Anti-fraud evidence: a duplicate attempt is a signal, never a user-facing hint. */
async function recordDuplicateAttempt({ giveawayId, userId, deviceRef, requestId }) {
  await FraudEvent.recordOrMerge({
    type: FRAUD_EVENT_TYPE.DUPLICATE_ATTEMPT,
    severity: FRAUD_SEVERITY.LOW,
    userId,
    giveawayId,
    deviceHash: deviceRef.deviceHash,
    sessionHash: deviceRef.sessionHash,
    ipHash: deviceRef.ipHash,
    clientClass: deviceRef.clientClass,
    requestId,
    actionTaken: 'RATE_LIMITED',
    signal: { ruleKey: 'participation_unique_index', metric: 'duplicate_join_attempts', observed: 1 },
  }).catch(() => null); // evidence must never mask the caller's own 409
}

/**
 * One honest velocity rule: the same device hash behind more than one account on
 * the same draw. No invented threshold — the event records what was OBSERVED and
 * leaves the judgement to the review queue.
 */
async function recordDeviceVelocity({ giveawayId, userId, deviceRef, requestId }) {
  if (!deviceRef.deviceHash) return null;
  const rows = await Participation.distinct('userId', {
    giveawayId,
    'deviceRef.deviceHash': deviceRef.deviceHash,
    status: { $in: [PARTICIPATION_STATUS.PENDING, PARTICIPATION_STATUS.CONFIRMED] },
  });
  if (rows.length < 2) return null;
  return FraudEvent.recordOrMerge({
    type: FRAUD_EVENT_TYPE.DEVICE_VELOCITY,
    severity: FRAUD_SEVERITY.MEDIUM,
    giveawayId,
    deviceHash: deviceRef.deviceHash,
    requestId,
    signal: { ruleKey: 'accounts_per_device_per_giveaway', metric: 'distinct_accounts', observed: rows.length },
  });
}

// ---------------------------------------------------------------------------
// Public API of the service
// ---------------------------------------------------------------------------
/** The authoritative pricing block returned to the caller (never client-supplied). */
function buildPricing({ fee, entries, free, paid, amount }) {
  return {
    currency: fee.currency,
    unitAmount: fee.amount,
    entries,
    freeEntries: free,
    paidEntries: paid,
    charged: amount,
    feeSource: fee.source,
  };
}

/**
 * Deterministic ledger idempotency key. With a client key it is scoped to that key
 * (so a genuine retry maps to the SAME ledger/provider key); without one it falls
 * back to a per-participation key, which the participation unique index already
 * guarantees is one-per-(user,giveaway).
 */
function ledgerIdempotencyKey({ clientKey, participationId, entries }) {
  if (clientKey) return `entry:${clientKey}`;
  return `entry:${participationId}:${entries}`;
}

/** Rebuilds a stored result for a retried idempotency key WITHOUT re-charging. */
async function replayResult(prior) {
  const participation = prior.participationId
    ? await Participation.findById(prior.participationId).lean()
    : null;
  if (!participation) throw domain('PARTICIPATION_NOT_FOUND');
  const [giveaway, prize] = await Promise.all([
    Giveaway.findById(participation.giveawayId).lean(),
    participation.prizeId ? Prize.findById(participation.prizeId).lean() : null,
  ]);
  const snap = prior.responseSnapshot || {};
  return {
    participation,
    giveaway: giveaway || { _id: participation.giveawayId, title: null, status: null },
    prize: prize || { _id: participation.prizeId, name: null },
    pricing: snap.pricing || null,
    balance: snap.balance || null,
    replayed: true,
  };
}

/** Writes the join audit entry. `session` keeps it atomic with the money path. */
async function recordJoinAudit({ participation, giveaway, prize, pricing, balance, context, userId, session }) {
  return AuditLog.record({
    actorId: userId,
    actorRole: 'user',
    action: 'giveaway.entry.join',
    entityType: 'GiveawayParticipation',
    entityId: participation._id,
    result: 'SUCCESS',
    requestId: context.requestId,
    after: {
      giveawayId: String(giveaway._id),
      prizeId: prize ? String(prize._id) : null,
      status: participation.status,
      pricing,
      balance,
    },
    session,
  });
}

/** Finalizes the idempotency record so a later retry replays instead of re-charging. */
async function finalizeIdempotency({ idempotencyKey, requestHash, userId, participation, ledgerId, pricing, balance, session }) {
  if (!idempotencyKey) return null;
  const set = {
    userId,
    key: idempotencyKey,
    requestHash,
    status: IdempotencyKey.STATUS.COMPLETE,
    participationId: participation._id,
    transactionId: ledgerId || null,
    responseSnapshot: {
      participationId: String(participation._id),
      status: participation.status,
      pricing,
      balance,
    },
  };
  return IdempotencyKey.findOneAndUpdate(
    { userId, key: idempotencyKey },
    { $set: set },
    { upsert: true, new: true, setDefaultsOnInsert: true, ...(session ? { session } : {}) },
  );
}

/**
 * The full write sequence for a PAID join in the in-DB `dev` wallet, run inside a
 * caller-supplied MongoDB `session` (transaction) or, when an operator has
 * explicitly relaxed the requirement, with `session = null` (sequential). Any throw
 * aborts the whole transaction, so a failure never leaves a partial charge or a
 * half-written participation behind.
 */
async function executeTransactionalJoin(ctx, session) {
  const { giveaway, prize, fee, free, paid, amount, entries, userId, deviceRef, context, idempotencyKey, requestHash } = ctx;

  // 1) The double-entry lock: one PENDING row, guarded by the unique index.
  let participation;
  try {
    [participation] = await Participation.create([{
      userId,
      giveawayId: giveaway._id,
      prizeId: prize._id,
      entryCurrency: fee.currency,
      entryAmount: amount,
      entryCount: entries,
      deviceRef,
      rulesVersion: giveaway.rules?.version || giveaway.termsVersion || null,
      status: PARTICIPATION_STATUS.PENDING,
    }], { session });
  } catch (err) {
    if (err && err.code === 11000) throw domain('ALREADY_JOINED');
    throw err;
  }

  // 2) Authoritative, atomic debit. Insufficient funds throws INSUFFICIENT_BALANCE
  //    from the adapter (the guarded $inc matched nothing), aborting the transaction.
  const charge = await wallet.debit({
    userId,
    currency: fee.currency,
    amount,
    idempotencyKey: ledgerIdempotencyKey({ clientKey: idempotencyKey, participationId: participation._id, entries }),
    reference: `giveaway:${giveaway._id}:user:${userId}`,
    session,
  });

  // 3) The settled ledger row, carrying before/after balance + the provider reference.
  const ledgerRow = (await Ledger.create([{
    userId,
    giveawayId: giveaway._id,
    prizeId: prize._id,
    participationId: participation._id,
    currency: fee.currency,
    amount,
    direction: Ledger.DIRECTION.DEBIT,
    type: TRANSACTION_TYPE.ENTRY_FEE,
    status: TRANSACTION_STATUS.SUCCESS,
    idempotencyKey: ledgerIdempotencyKey({ clientKey: idempotencyKey, participationId: participation._id, entries }),
    externalTransactionId: charge.externalTransactionId || null,
    balanceBefore: charge.balanceBefore,
    balanceAfter: charge.balanceAfter,
    walletSource: WALLET_SOURCE.SEED_FIXTURE,
    entriesGranted: entries,
    sourceEndpoint: 'POST /api/v1/giveaways/:id/join',
    clientClass: deviceRef.clientClass,
    requestId: context.requestId,
    completedAt: new Date(),
  }], { session }))[0];

  // 4) Confirm the participation and link the ledger row.
  participation.transactionId = ledgerRow._id;
  participation.transactionIds = [ledgerRow._id];
  participation.status = PARTICIPATION_STATUS.CONFIRMED;
  await participation.save({ session });

  // 5) Audit + idempotency, both inside the transaction (a failure here rolls the
  //    whole join back — success is never reported without its audit record).
  const pricing = buildPricing({ fee, entries, free, paid, amount });
  const balance = { currency: fee.currency, balance: typeof charge.balanceAfter === 'number' ? charge.balanceAfter : null };
  await recordJoinAudit({ participation, giveaway, prize, pricing, balance, context, userId, session });
  await finalizeIdempotency({ idempotencyKey, requestHash, userId, participation, ledgerId: ledgerRow._id, pricing, balance, session });

  await Giveaway.updateOne(
    { _id: giveaway._id },
    { $inc: { 'stats.participationCount': 1, 'stats.entryCount': entries }, $set: { 'stats.recalculatedAt': new Date() } },
    { session },
  );

  return { participation, giveaway, prize, pricing, balance, replayed: false };
}

// ---------------------------------------------------------------------------
// Public API of the service
// ---------------------------------------------------------------------------
/**
 * POST /giveaways/:id/join — create the caller's participation.
 * `userId` comes from the verified auth context and appears nowhere in the body;
 * the fee and currency are resolved from stored prize configuration, never trusted
 * from the client. A paid join in the in-DB `dev` wallet runs as ONE MongoDB
 * transaction; on a deployment without transaction support it FAILS CLOSED.
 */
async function join({ giveawayId, userId, entries = 1, currency, prizeId, context = {}, idempotencyKey } = {}) {
  const target = await resolveEntryTarget({ giveawayId, prizeId, currency, entries });
  const { giveaway, prize, fee, free, paid, amount } = target;

  assertEntryWindow(giveaway, context.now || new Date());

  const user = await User.findById(userId);
  if (!user) throw domain('IDENTITY_UNRESOLVED');
  eligibility.assertEligible(giveaway.eligibility, { user, geo: context.geo || {}, now: context.now });

  await assertEntryQuota(giveaway, prize, { userId, entries, now: context.now || new Date() });

  const deviceRef = buildDeviceRef({ ...context, ip: context.ip, geo: context.geo });
  if (giveaway.participation.requireDeviceReference && !hasClientReference(deviceRef)) {
    throw domain('DEVICE_REFERENCE_REQUIRED', undefined, { hint: 'Send deviceReference or sessionReference with the request.' });
  }

  // Risk engine runs BEFORE any money moves and before any participation write:
  // a REJECT is a generic 403 with zero side effects (no charge, no row, no audit
  // of a charge that never happened). A FLAG proceeds but queues evidence. Detail
  // never reaches the caller. When the engine is disabled this is a no-op ALLOW.
  const risk = await fraud.assessEntryRisk({ user, userId, giveawayId: giveaway._id, deviceRef, now: context.now || new Date() });
  if (risk.decision !== RISK_DECISION.ALLOW) {
    await fraud.recordEntryDecision({ ...risk, userId, giveawayId: giveaway._id, deviceRef, requestId: context.requestId }).catch(() => null);
  }
  if (risk.decision === RISK_DECISION.REJECT) throw domain('ENTRY_BLOCKED');

  const isPaid = amount > 0;
  const mode = wallet.mode();

  // Idempotency intake BEFORE any write: a completed key replays, an in-flight key
  // conflicts, and the same key used for a different request is refused.
  const requestHash = idempotencyKey
    ? IdempotencyKey.computeRequestHash({ giveawayId, prizeId: prize._id, currency: fee.currency, entries })
    : null;
  if (idempotencyKey) {
    const prior = await IdempotencyKey.findOne({ userId, key: idempotencyKey }).lean();
    const decision = IdempotencyKey.classify(prior, requestHash);
    if (decision === 'REPLAY') return replayResult(prior);
    if (decision === 'IN_PROGRESS') throw domain('IDEMPOTENCY_IN_PROGRESS');
    if (decision === 'CONFLICT') throw domain('IDEMPOTENCY_KEY_CONFLICT');
  }

  // Paid join on the in-DB dev wallet: one atomic MongoDB transaction (or fail closed).
  if (isPaid && mode === 'dev') {
    const ctx = { giveaway, prize, fee, free, paid, amount, entries, userId, deviceRef, context, idempotencyKey, requestHash };
    if (await supportsTransactions()) {
      const result = await withTransaction((session) => executeTransactionalJoin(ctx, session));
      await recordDeviceVelocity({ giveawayId: giveaway._id, userId, deviceRef, requestId: context.requestId }).catch(() => null);
      return result;
    }
    // No transaction support: never fall back to unsafe sequential money writes
    // unless an operator has explicitly opted out of the requirement.
    if (config.wallet.requireTransactionSupport) throw domain('TRANSACTION_INFRASTRUCTURE_REQUIRED');
    const result = await executeTransactionalJoin(ctx, null);
    await recordDeviceVelocity({ giveawayId: giveaway._id, userId, deviceRef, requestId: context.requestId }).catch(() => null);
    return result;
  }

  // Free join (any mode) or paid join on the EXTERNAL http wallet: the existing
  // ordered flow. The external debit is coordinated by the provider idempotency key
  // and a compensating reversal, never by pretending a local transaction covers it.
  let participation;
  try {
    [participation] = await Participation.create([{
      userId,
      giveawayId: giveaway._id,
      prizeId: prize._id,
      entryCurrency: fee.currency,
      entryAmount: paid > 0 ? amount : 0,
      entryCount: entries,
      deviceRef,
      rulesVersion: giveaway.rules?.version || giveaway.termsVersion || null,
      status: PARTICIPATION_STATUS.PENDING,
    }]);
  } catch (err) {
    if (err && err.code === 11000) {
      await recordDuplicateAttempt({ giveawayId: giveaway._id, userId, deviceRef, requestId: context.requestId });
      const existing = await Participation.findOne({ userId, giveawayId: giveaway._id }).lean();
      throw domain('ALREADY_JOINED', undefined, existing
        ? { participationId: String(existing._id), status: existing.status, joinedAt: existing.joinedAt }
        : undefined);
    }
    throw err;
  }

  await recordDeviceVelocity({ giveawayId: giveaway._id, userId, deviceRef, requestId: context.requestId }).catch(() => null);

  let ledgerRow = null;
  if (isPaid) {
    try {
      ledgerRow = await chargeEntry({
        giveaway, prize, participation, fee, amount,
        requestId: context.requestId,
        clientClass: deviceRef.clientClass,
        idempotencyKey,
      });
    } catch (err) {
      // Nothing was captured: remove the never-charged PENDING row so the user can retry.
      await participation.deleteOne().catch(() => null);
      throw err;
    }
    participation.transactionId = ledgerRow._id;
    participation.transactionIds = [ledgerRow._id];
  }

  participation.status = PARTICIPATION_STATUS.CONFIRMED;
  await participation.save();

  await Giveaway.updateOne(
    { _id: giveaway._id },
    { $inc: { 'stats.participationCount': 1, 'stats.entryCount': entries }, $set: { 'stats.recalculatedAt': new Date() } },
  ).catch(() => null);

  const pricing = buildPricing({ fee, entries, free, paid, amount });
  const balance = isPaid
    ? { currency: fee.currency, balance: typeof ledgerRow?.balanceAfter === 'number' ? ledgerRow.balanceAfter : null }
    : null;

  // Audit + idempotency finalize are best-effort on the external path (the provider
  // call is not in a local transaction); the participation unique index + provider
  // idempotency key are what actually prevent a double charge.
  await recordJoinAudit({ participation, giveaway, prize, pricing, balance, context, userId }).catch(() => null);
  await finalizeIdempotency({ idempotencyKey, requestHash, userId, participation, ledgerId: participation.transactionId, pricing, balance }).catch(() => null);

  return { participation, giveaway, prize, pricing, balance, replayed: false };
}

/** GET /giveaways/my-status — the caller's own entries, newest first, paginated. */
async function myParticipations({ userId, giveawayId, status, page = 1, limit = 20 }) {
  const filter = { userId };
  if (giveawayId) filter.giveawayId = giveawayId;
  if (status) filter.status = status;
  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    Participation.find(filter).sort({ joinedAt: -1 }).skip(skip).limit(limit).select(OWNER_PROJECTION).lean(),
    Participation.countDocuments(filter),
  ]);

  // One round trip per page (not per row) to keep the response useful: is the
  // caller a winner, and does a claim need action?
  const giveawayIds = [...new Set(rows.map((r) => String(r.giveawayId)))];
  const [winners, claims] = await Promise.all([
    giveawayIds.length ? GiveawayWinner.find({ giveawayId: { $in: giveawayIds }, userId }).select('giveawayId prizeId rank announcementStatus').lean() : [],
    giveawayIds.length ? PrizeClaim.find({ giveawayId: { $in: giveawayIds }, userId }).select('giveawayId prizeId status deadlineAt').lean() : [],
  ]);
  const winIndex = new Map(winners.map((w) => [String(w.giveawayId), w]));
  const claimIndex = new Map(claims.map((c) => [String(c.giveawayId), c]));

  const items = rows.map((row) => {
    const win = winIndex.get(String(row.giveawayId));
    const claim = claimIndex.get(String(row.giveawayId));
    return {
      ...row,
      id: String(row._id),
      _id: undefined,
      giveawayId: String(row.giveawayId),
      prizeId: row.prizeId ? String(row.prizeId) : null,
      isWinner: Boolean(win),
      winnerRank: win ? win.rank : null,
      resultsPublished: win ? win.announcementStatus === 'ANNOUNCED' : false,
      claim: claim
        ? {
          id: String(claim._id),
          status: claim.status,
          deadlineAt: claim.deadlineAt,
          expired: claim.deadlineAt < new Date(),
        }
        : null,
    };
  });

  // Titles in one extra query, so "my status" is readable without a second call.
  if (items.length) {
    const titles = await Giveaway.find({ _id: { $in: giveawayIds } }).select('title status slug').lean();
    const byId = new Map(titles.map((g) => [String(g._id), g]));
    for (const item of items) {
      const g = byId.get(String(item.giveawayId));
      item.giveaway = g ? { id: String(g._id), title: g.title, slug: g.slug, status: g.status } : { id: String(item.giveawayId) };
    }
  }
  return { items, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}

/** One giveaway's entry state for the caller — including "you have not joined". */
async function myStatusForGiveaway({ userId, giveawayId }) {
  const [giveaway, participation] = await Promise.all([
    Giveaway.findById(giveawayId).lean(),
    Participation.findOne({ userId, giveawayId }).select(OWNER_PROJECTION).lean(),
  ]);
  if (!giveaway) throw domain('GIVEAWAY_NOT_FOUND');
  const [winner, claim] = await Promise.all([
    GiveawayWinner.findOne({ giveawayId, userId }).select('rank announcementStatus prizeId').lean(),
    PrizeClaim.findOne({ giveawayId, userId }).select('status deadlineAt prizeId').lean(),
  ]);
  return {
    giveawayId: String(giveawayId),
    title: giveaway.title,
    status: giveaway.status,
    published: giveaway.published,
    joined: Boolean(participation),
    participation: participation ? { ...participation, id: String(participation._id), _id: undefined } : null,
    entryWindowOpen: giveaway.published
      && giveaway.status === GIVEAWAY_STATUS.ACTIVE
      && giveaway.startAt <= new Date()
      && new Date() <= new Date(giveaway.endAt.getTime() + ((giveaway.participation?.entryCloseGraceSeconds || 0) * 1000)),
    isWinner: Boolean(winner),
    winnerRank: winner ? winner.rank : null,
    claim: claim
      ? {
        id: String(claim._id),
        status: claim.status,
        deadlineAt: claim.deadlineAt,
        expired: claim.deadlineAt < new Date(),
      }
      : null,
  };
}

/**
 * Admin: void or disqualify a participation, optionally refunding the captured
 * fee through a compensating ledger row. Never a silent delete of real history.
 */
async function voidParticipation({ participationId, actorUserId, reason, mode = PARTICIPATION_STATUS.VOIDED_FRAUD, refund = false }) {
  if (![PARTICIPATION_STATUS.VOIDED_FRAUD, PARTICIPATION_STATUS.DISQUALIFIED].includes(mode)) {
    throw ApiError.badRequest('A participation can only be voided or disqualified.', { mode });
  }
  const participation = await Participation.findById(participationId);
  if (!participation) throw domain('PARTICIPATION_NOT_FOUND');
  if (Participation.TERMINAL_STATUSES.includes(participation.status)) {
    throw domain('PARTICIPATION_FINAL', undefined, { status: participation.status });
  }

  let reversal = null;
  if (refund && participation.transactionId) {
    reversal = await Ledger.reverse(participation.transactionId, {
      authorizedBy: actorUserId,
      reason,
      note: `Participation ${participation._id} voided by ${actorUserId}`,
    });
    await WalletReference.markStale(participation.userId, participation.entryCurrency, 'REVERSAL_ISSUED');
  }

  participation.status = mode;
  participation.voidReason = String(reason).slice(0, 500);
  await participation.save();

  await Giveaway.updateOne(
    { _id: participation.giveawayId },
    { $inc: { 'stats.entryCount': -participation.entryCount }, $set: { 'stats.recalculatedAt': new Date() } },
  ).catch(() => null);

  return { participation, reversal };
}

module.exports = {
  join,
  myParticipations,
  myStatusForGiveaway,
  voidParticipation,
  observeBalance,
  chargeEntry,
  assertEntryWindow,
  assertEntryQuota,
  resolveEntryTarget,
  recordDeviceVelocity,
  OWNER_PROJECTION,
};
