/**
 * ============================================================================
 * WINNER SERVICE — drawing, publishing and reviewing the result of a draw.
 * ============================================================================
 * Rules that shape this file:
 *  - A draw may only run once the entry window is CLOSED, on the server clock.
 *  - Selection uses `crypto.randomInt` (a CSPRNG), never `Math.random`, and the
 *    provenance of the run is recorded (`snapshotHash`, candidate/entry counts,
 *    ticket range) so an auditor can see WHICH snapshot produced the result.
 *  - Winner rows are created on HOLD: nothing becomes public until an operator
 *    explicitly publishes it. Publication is one-way (the model refuses a revert).
 *  - A public winner list carries a MASKED alias only. The masking helper never
 *    accepts caller-supplied text, so an email or phone cannot reach `displayInfo`
 *    (the model validates that too, but the API should not create invalid rows).
 *  - Slots are capped by `Prize.winnerCount` and the unique (prizeId, rank) index,
 *    so a prize can never gain more winners than it was configured with.
 * ========================================================================= */
const crypto = require('crypto');
const Giveaway = require('../models/giveaway.model.js');
const Prize = require('../models/prize.model.js');
const Participation = require('../models/giveawayParticipation.model.js');
const Winner = require('../models/giveawayWinner.model.js');
const PrizeClaim = require('../models/prizeClaim.model.js');
const User = require('../models/user.model.js');
const AuditLog = require('../models/auditLog.model.js');
const { domain } = require('../utils/domainErrors.js');
const { hashReference } = require('../utils/schema.js');
const {
  PARTICIPATION_STATUS,
  GIVEAWAY_STATUS,
  WINNER_ANNOUNCEMENT_STATUS,
  WINNER_VERIFICATION_STATUS,
} = require('../config/constants.js');

const DAY_MS = 86_400_000;

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

/** Masked, stable, non-PII public label for a winner. */
function maskedDisplayFor(user) {
  const alias = user && user.publicAlias ? String(user.publicAlias).trim() : '';
  return {
    // `publicAlias` is app-owned display text ("Member #4821"), never an identity.
    displayAlias: alias || `Member #${hashReference(`alias:${user?._id}`).slice(0, 6).toUpperCase()}`,
    maskedUserId: `usr_${hashReference(`user:${user?._id}`).slice(0, 8)}`,
  };
}

/** The entry window must be finished before anyone can be declared a winner. */
function assertDrawAllowed(giveaway, now) {
  const graceMs = (giveaway.participation?.entryCloseGraceSeconds || 0) * 1000;
  const closed = now > new Date(giveaway.endAt.getTime() + graceMs)
    || giveaway.status === GIVEAWAY_STATUS.ENDED
    || giveaway.status === GIVEAWAY_STATUS.ARCHIVED;
  if (!closed) throw domain('DRAW_WINDOW_OPEN', undefined, { endAt: giveaway.endAt, status: giveaway.status });
  return true;
}

const claimWindowDaysFor = (giveaway, prize) =>
  giveaway.prizeConfig?.claimWindowDays || prize.claim?.windowDays || null;

/**
 * Draws the remaining slots of one prize tier and opens a claim for each winner.
 * Idempotent in the useful direction: running it again only fills slots that are
 * still empty, and reports WINNERS_ALREADY_SELECTED when the tier is complete.
 */
async function drawWinners({ giveawayId, prizeId, count, actorUserId, requestId, now = new Date() }) {
  const giveaway = await Giveaway.findById(giveawayId);
  if (!giveaway) throw domain('GIVEAWAY_NOT_FOUND');

  const prize = await Prize.findById(prizeId);
  if (!prize) throw domain('PRIZE_NOT_AVAILABLE');
  if (String(prize.giveawayId) !== String(giveaway._id)) throw domain('PRIZE_MISMATCH');

  assertDrawAllowed(giveaway, now);

  const windowDays = claimWindowDaysFor(giveaway, prize);
  if (!windowDays) {
    throw domain('CLAIM_WINDOW_UNCONFIGURED', undefined, {
      hint: 'Set Giveaway.prizeConfig.claimWindowDays or Prize.claim.windowDays first.',
    });
  }

  const existing = await Winner.find({ prizeId: prize._id }).select('rank').sort({ rank: 1 }).lean();
  const highestRank = existing.reduce((max, w) => Math.max(max, w.rank || 0), 0);
  const freeSlots = prize.winnerCount - existing.length;
  if (freeSlots <= 0) throw domain('WINNERS_ALREADY_SELECTED', undefined, { prizeId: String(prize._id), winnerCount: prize.winnerCount });
  const toDraw = Math.min(freeSlots, Number.isFinite(count) && count > 0 ? count : freeSlots);

  // Candidates: confirmed entries of this tier, minus anyone who already holds a
  // slot in this draw unless the operator configured duplicate winners.
  const holderRows = await Winner.find({ giveawayId: giveaway._id }).select('userId').lean();
  const excluded = new Set(holderRows.map((w) => String(w.userId)));
  const candidates = (await Participation.find({
    giveawayId: giveaway._id,
    prizeId: prize._id,
    status: PARTICIPATION_STATUS.CONFIRMED,
  }).select('userId entryCount').sort({ joinedAt: 1 }).lean())
    .filter((c) => (giveaway.prizeConfig?.allowDuplicateWinners ? true : !excluded.has(String(c.userId))));

  if (!candidates.length) throw domain('NO_ELIGIBLE_ENTRIES', undefined, { prizeId: String(prize._id) });

  const chosen = selectWinners(candidates, toDraw, giveaway.prizeConfig?.drawMethod || 'RANDOM');
  const snapshotHash = sha256(candidates.map((c) => `${c.userId}:${c.entryCount}`).join('|'));
  const userIds = chosen.map((c) => c.userId);
  const users = await User.find({ _id: { $in: userIds } }).select('publicAlias').lean();
  const userById = new Map(users.map((u) => [String(u._id), u]));

  const created = [];
  for (let i = 0; i < chosen.length; i += 1) {
    // Next free slot after the highest rank already used, so a partially drawn or
    // later-disqualified tier can never collide with an existing (prizeId, rank).
    const rank = highestRank + i + 1;
    const winner = await Winner.create({
      giveawayId: giveaway._id,
      prizeId: prize._id,
      userId: chosen[i].userId,
      participationId: chosen[i]._id,
      rank,
      duplicateAllowed: Boolean(giveaway.prizeConfig?.allowDuplicateWinners),
      announcementStatus: WINNER_ANNOUNCEMENT_STATUS.HOLD,
      displayInfo: maskedDisplayFor(userById.get(String(chosen[i].userId))),
      prizeSnapshot: {
        name: prize.name,
        prizeType: prize.prizeType,
        claimType: prize.claimType,
        imageRef: prize.imageRef || null,
      },
      selection: {
        method: giveaway.prizeConfig?.drawMethod || 'RANDOM',
        algorithmVersion: 'draw-v1',
        snapshotHash,
        seedHash: sha256(`${snapshotHash}:${rank}:${chosen[i].userId}`),
        candidateCount: candidates.length,
        entryCount: candidates.reduce((s, c) => s + (c.entryCount || 1), 0),
        ticketRange: chosen[i].ticketRange,
        drawnAt: now,
        drawnBy: actorUserId,
        requestId,
      },
    });
    // The claim exists from the moment the win exists: the deadline is auditable
    // and the winner's endpoint has something to act on.
    const claim = await PrizeClaim.create({
      winnerId: winner._id,
      giveawayId: giveaway._id,
      userId: winner.userId,
      prizeId: prize._id,
      claimType: prize.claimType,
      prizeType: prize.prizeType,
      deadlineAt: new Date(now.getTime() + windowDays * DAY_MS),
    });
    created.push({ winner, claim });
  }

  const total = await Winner.countDocuments({ giveawayId: giveaway._id });
  await Giveaway.updateOne(
    { _id: giveaway._id },
    { $set: { 'stats.winnerCount': total, 'stats.recalculatedAt': new Date() } },
  ).catch(() => null);

  await AuditLog.record({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'giveaway.winners.draw',
    entityType: 'Prize',
    entityId: prize._id,
    after: { drawn: created.length, rankFrom: highestRank + 1, rankTo: highestRank + created.length, candidateCount: candidates.length, snapshotHash },
    requestId,
  }).catch(() => null);

  return { giveaway, prize, created, claimWindowDays: windowDays, candidateCount: candidates.length, freeSlotsAfter: freeSlots - created.length };
}

/**
 * The selection itself. RANDOM draws distinct candidates; WEIGHTED_BY_ENTRIES
 * gives every entry ticket of a participant the same chance, so someone with 4
 * paid entries holds 4 tickets — the pricing rule from Prize/Participation
 * carrying through into the draw without any special-casing here.
 */
function selectWinners(candidates, toDraw, method) {
  const picked = [];
  const taken = new Set();

  if (method === 'WEIGHTED_BY_ENTRIES') {
    const weights = candidates.map((c) => Math.max(1, c.entryCount || 1));
    const totalTickets = weights.reduce((s, w) => s + w, 0);
    let cursor = 0;
    const ranges = [];
    candidates.forEach((c, i) => {
      ranges.push({ index: i, from: cursor, to: cursor + weights[i] - 1 });
      cursor += weights[i];
    });
    while (picked.length < Math.min(toDraw, candidates.length)) {
      const ticket = crypto.randomInt(0, totalTickets);
      const hit = ranges.find((r) => ticket >= r.from && ticket <= r.to && !taken.has(r.index));
      if (!hit) continue; // taken slot: redraw rather than skew the distribution
      taken.add(hit.index);
      picked.push({ ...candidates[hit.index], ticketRange: `${String(hit.from).padStart(4, '0')}-${String(hit.to).padStart(4, '0')}` });
    }
    return picked;
  }

  while (picked.length < Math.min(toDraw, candidates.length)) {
    const index = crypto.randomInt(0, candidates.length);
    if (taken.has(index)) continue;
    taken.add(index);
    picked.push({ ...candidates[index], ticketRange: `#${index}` });
  }
  return picked;
}

/** PRIVATE_NOTIFIED: the winner is told before anything goes public. */
async function privateNotify({ giveawayId, prizeId, actorUserId, requestId }) {
  const filter = { giveawayId, announcementStatus: WINNER_ANNOUNCEMENT_STATUS.HOLD };
  if (prizeId) filter.prizeId = prizeId;
  const rows = await Winner.find(filter);
  if (!rows.length) throw domain('RESULTS_NOT_AVAILABLE', 'No winners are waiting to be notified.');
  for (const w of rows) {
    w.announcementStatus = WINNER_ANNOUNCEMENT_STATUS.PRIVATE_NOTIFIED;
    w.privateNotifiedAt = new Date();
    await w.save();
  }
  await AuditLog.record({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'giveaway.winners.private_notify',
    entityType: 'Giveaway',
    entityId: giveawayId,
    after: { notified: rows.length },
    requestId,
  }).catch(() => null);
  // Honest scope note: this records that the operator opened the private step.
  // Actual delivery needs the notification service, which does not exist here.
  return { notified: rows.length, delivered: false, note: 'Status recorded; message delivery requires the VELOOP notification layer.' };
}

/** Make the result public. One-way, and only ever for masked rows. */
async function publishWinners({ giveawayId, prizeId, actorUserId, requestId }) {
  const giveaway = await Giveaway.findById(giveawayId);
  if (!giveaway) throw domain('GIVEAWAY_NOT_FOUND');
  if (!giveaway.published) throw domain('GIVEAWAY_NOT_FOUND');

  const filter = {
    giveawayId,
    announcementStatus: { $in: [WINNER_ANNOUNCEMENT_STATUS.HOLD, WINNER_ANNOUNCEMENT_STATUS.PRIVATE_NOTIFIED] },
    verificationStatus: { $ne: WINNER_VERIFICATION_STATUS.DISQUALIFIED },
  };
  if (prizeId) filter.prizeId = prizeId;
  const rows = await Winner.find(filter);
  if (!rows.length) throw domain('RESULTS_NOT_AVAILABLE', 'There is nothing left to publish for this giveaway.');

  const published = [];
  for (const w of rows) {
    w.announcementStatus = WINNER_ANNOUNCEMENT_STATUS.ANNOUNCED;
    await w.save();
    published.push(w);
  }
  await AuditLog.record({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'giveaway.winners.publish',
    entityType: 'Giveaway',
    entityId: giveawayId,
    after: { published: published.length },
    requestId,
  }).catch(() => null);
  return { published: published.length };
}

/** Operator decision about a winner's eligibility. Never deletes the row. */
async function setVerification({ winnerId, verificationStatus, reason, actorUserId, requestId }) {
  const winner = await Winner.findById(winnerId);
  if (!winner) throw domain('WINNER_NOT_FOUND');
  winner.verificationStatus = verificationStatus;
  if (verificationStatus === WINNER_VERIFICATION_STATUS.DISQUALIFIED) {
    winner.disqualifiedReason = String(reason || 'Disqualified by operator').slice(0, 300);
  }
  await winner.save();
  await AuditLog.record({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'winner.verification.update',
    entityType: 'GiveawayWinner',
    entityId: winner._id,
    result: 'SUCCESS',
    reason: verificationStatus === WINNER_VERIFICATION_STATUS.DISQUALIFIED ? winner.disqualifiedReason : undefined,
    after: { verificationStatus },
    requestId,
  }).catch(() => null);
  return winner;
}

/**
 * The public winner list: announced rows only, masked fields only, paginated.
 * `userId` is deliberately absent — a client has no business enumerating who won.
 */
async function publicWinners({ giveawayId, page = 1, limit = 20 }) {
  const giveaway = await Giveaway.findById(giveawayId).select('title slug status published').lean();
  if (!giveaway || !giveaway.published) throw domain('GIVEAWAY_NOT_FOUND');

  const filter = {
    giveawayId,
    announcementStatus: WINNER_ANNOUNCEMENT_STATUS.ANNOUNCED,
    verificationStatus: { $ne: WINNER_VERIFICATION_STATUS.DISQUALIFIED },
  };
  const total = await Winner.countDocuments(filter);
  if (!total) throw domain('RESULTS_NOT_AVAILABLE', undefined, { status: giveaway.status });

  const rows = await Winner.find(filter)
    .select('rank prizeSnapshot displayInfo announcedAt prizeId')
    .sort({ rank: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return {
    giveaway: { id: String(giveaway._id), title: giveaway.title, slug: giveaway.slug, status: giveaway.status },
    items: rows.map((w) => ({
      id: String(w._id),
      rank: w.rank,
      prizeId: String(w.prizeId),
      prizeName: w.prizeSnapshot?.name || null,
      prizeType: w.prizeSnapshot?.prizeType || null,
      display: w.displayInfo || {},
      announcedAt: w.announcedAt || null,
    })),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/** Admin review view: full rows, references only, paginated. */
async function adminWinners({ giveawayId, prizeId, announcementStatus, page = 1, limit = 20 }) {
  const filter = { giveawayId };
  if (prizeId) filter.prizeId = prizeId;
  if (announcementStatus) filter.announcementStatus = announcementStatus;
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    Winner.find(filter).sort({ prizeId: 1, rank: 1 }).skip(skip).limit(limit).lean(),
    Winner.countDocuments(filter),
  ]);
  return {
    items: rows.map((w) => ({
      id: String(w._id),
      giveawayId: String(w.giveawayId),
      prizeId: String(w.prizeId),
      userId: String(w.userId),
      participationId: w.participationId ? String(w.participationId) : null,
      rank: w.rank,
      announcementStatus: w.announcementStatus,
      verificationStatus: w.verificationStatus,
      announcedAt: w.announcedAt || null,
      privateNotifiedAt: w.privateNotifiedAt || null,
      disqualifiedReason: w.disqualifiedReason || null,
      display: w.displayInfo || {},
      prizeSnapshot: w.prizeSnapshot || null,
      selection: w.selection ? { method: w.selection.method, snapshotHash: w.selection.snapshotHash, drawnAt: w.selection.drawnAt, candidateCount: w.selection.candidateCount } : null,
    })),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

module.exports = {
  drawWinners,
  selectWinners,
  maskedDisplayFor,
  assertDrawAllowed,
  claimWindowDaysFor,
  privateNotify,
  publishWinners,
  setVerification,
  publicWinners,
  adminWinners,
  DAY_MS,
};
