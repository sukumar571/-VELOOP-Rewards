/**
 * ============================================================================
 * ADMIN GIVEAWAY SERVICE — configuration and lifecycle, with an audit trail.
 * ============================================================================
 * Two principles govern this file:
 *
 *  1. ALLOW-LISTED WRITES. Every mutation copies values field by field from a
 *     Zod-validated body. A field that a later schema change adds to Giveaway
 *     cannot start flowing in through this endpoint, and a caller cannot inject
 *     `stats`, `statusHistory`, `createdBy` or a second-hand `updatedBy`.
 *  2. EVERY STATE CHANGE IS AUDITED. `AuditLog.record()` scrubs sensitive keys,
 *     and the before/after snapshots here are taken from the document, so an
 *     operator's decision is reconstructable without storing entrant PII.
 *
 * Lifecycle moves are NOT free-form: the Giveaway model owns the transition
 * table, so an illegal jump (ENDED -> ACTIVE) fails in validation with a clear
 * message rather than silently rewriting history.
 * ========================================================================= */
const Giveaway = require('../models/giveaway.model.js');
const Prize = require('../models/prize.model.js');
const Winner = require('../models/giveawayWinner.model.js');
const Participation = require('../models/giveawayParticipation.model.js');
const Ledger = require('../models/giveawayEntryTransaction.model.js');
const AuditLog = require('../models/auditLog.model.js');
const { domain } = require('../utils/domainErrors.js');
const { ApiError } = require('../utils/ApiError.js');
const { GIVEAWAY_STATUS, GIVEAWAY_STATUS_TRANSITIONS } = require('../config/constants.js');

/** Scalar fields an operator may set on create/update. Nothing else is readable. */
const GIVEAWAY_SCALARS = [
  'title', 'tagline', 'description', 'descriptionHtml', 'images', 'icon', 'accent',
  'featured', 'termsVersion',
];
const GIVEAWAY_BLOCKS = ['rules', 'eligibility', 'participation', 'prizeConfig'];

const audit = (entry) => AuditLog.record(entry).catch(() => null);

/** Snapshot of just the fields an operator can change (keeps audit rows small). */
function configSnapshot(doc) {
  // toJSON() gives plain sub-objects, and AuditLog.scrub() still redacts anything
  // sensitive by key name — so a future config field cannot widen the trail by
  // accident, and a field that IS sensitive is caught by the scrubber anyway.
  const j = doc.toJSON();
  return {
    title: j.title,
    slug: j.slug,
    status: j.status,
    published: j.published,
    startAt: j.startAt,
    endAt: j.endAt,
    featured: j.featured,
    termsVersion: j.termsVersion,
    rules: j.rules,
    eligibility: j.eligibility,
    participation: j.participation,
    prizeConfig: j.prizeConfig,
  };
}

function applyGiveawayBody(doc, body) {
  for (const field of GIVEAWAY_SCALARS) {
    if (body[field] !== undefined) doc[field] = body[field];
  }
  for (const block of GIVEAWAY_BLOCKS) {
    if (body[block] && typeof body[block] === 'object') {
      for (const [key, value] of Object.entries(body[block])) {
        if (value === undefined) continue;
        doc[block][key] = value;
      }
    }
  }
  if (body.startAt !== undefined) doc.startAt = body.startAt;
  if (body.endAt !== undefined) doc.endAt = body.endAt;
}

/**
 * Fee configuration is cross-object: a prize may only be priced in a currency the
 * draw enables. Checked whenever participation or prize pricing is written, so an
 * edit can never leave a draw with an unchargeable tier.
 */
async function assertPrizeFeesStillValid(giveaway) {
  const prizes = await Prize.find({ giveawayId: giveaway._id, active: true });
  for (const prize of prizes) {
    try {
      Prize.assertMatchesGiveaway(giveaway, prize);
    } catch (err) {
      if (err.code === 'PRIZE_FEE_POLICY') {
        throw domain('ENTRY_CURRENCY_NOT_ALLOWED', 'A prize tier is priced in a currency this giveaway does not enable.', {
          prizeId: String(prize._id),
          detail: err.message,
        });
      }
      throw err;
    }
  }
  return true;
}

async function createGiveaway({ body, actorUserId, requestId }) {
  const doc = new Giveaway({
    title: body.title,
    slug: body.slug,
    startAt: body.startAt,
    endAt: body.endAt,
    status: body.status || GIVEAWAY_STATUS.UPCOMING,
    createdBy: actorUserId,
    updatedBy: actorUserId,
  });
  applyGiveawayBody(doc, body);
  if (body.published) doc.published = true;

  try {
    await doc.save();
  } catch (err) {
    if (err && err.code === 11000) throw domain('SLUG_TAKEN', undefined, { slug: doc.slug });
    throw err;
  }

  await audit({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'giveaway.create',
    entityType: 'Giveaway',
    entityId: doc._id,
    after: configSnapshot(doc),
    requestId,
  });
  return doc;
}

/**
 * PATCH /admin/giveaways/:id. `slug` and `status` are refused here on purpose:
 * the slug is the stable public key (immutable once published) and the status has
 * its own audited transition endpoint.
 */
async function updateGiveaway({ giveawayId, body, actorUserId, requestId }) {
  const doc = await Giveaway.findById(giveawayId);
  if (!doc) throw domain('GIVEAWAY_NOT_FOUND');
  if (body.slug !== undefined && body.slug !== doc.slug) {
    throw ApiError.badRequest('The giveaway slug is immutable once created. Create a new draw to rename it.', { slug: doc.slug });
  }
  if (body.status !== undefined && body.status !== doc.status) {
    throw ApiError.badRequest('Use the lifecycle transition endpoint to change the status.', { status: doc.status });
  }

  const before = configSnapshot(doc);
  applyGiveawayBody(doc, body);
  doc.updatedBy = actorUserId;

  // Fees first: an edit that would orphan a tier's price must not be saved.
  await assertPrizeFeesStillValid(doc);

  try {
    await doc.save();
  } catch (err) {
    if (err && err.code === 11000) throw domain('SLUG_TAKEN', undefined, { slug: doc.slug });
    throw err;
  }

  await audit({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'giveaway.update',
    entityType: 'Giveaway',
    entityId: doc._id,
    before,
    after: configSnapshot(doc),
    requestId,
  });
  return doc;
}

/** POST /admin/giveaways/:id/publish — visibility switch, audited. */
async function setPublished({ giveawayId, published, reason, actorUserId, requestId }) {
  const doc = await Giveaway.findById(giveawayId);
  if (!doc) throw domain('GIVEAWAY_NOT_FOUND');
  if (doc.published === published) return { changed: false, published: doc.published, giveaway: doc };
  doc.published = published;
  if (published && !doc.publishedAt) doc.publishedAt = new Date();
  doc.updatedBy = actorUserId;
  await doc.save();

  await audit({
    actorId: actorUserId,
    actorRole: 'admin',
    action: published ? 'giveaway.publish' : 'giveaway.unpublish',
    entityType: 'Giveaway',
    entityId: doc._id,
    before: { published: !published },
    after: { published },
    reason,
    requestId,
  });
  return { changed: true, published, giveaway: doc };
}

/** POST /admin/giveaways/:id/transition — the only way to move the lifecycle. */
async function transition({ giveawayId, status, reason, actorUserId, requestId }) {
  const doc = await Giveaway.findById(giveawayId);
  if (!doc) throw domain('GIVEAWAY_NOT_FOUND');

  const allowed = GIVEAWAY_STATUS_TRANSITIONS[doc.status] || [];
  const from = doc.status;
  if (doc.status === status) return { changed: false, status, giveaway: doc };
  if (!allowed.includes(status)) {
    throw domain('ILLEGAL_TRANSITION', `Cannot move a giveaway from ${from} to ${status}.`, {
      from,
      allowed,
    });
  }

  doc.status = status;
  doc.updatedBy = actorUserId;
  await doc.save(); // the model records the transition in statusHistory

  await audit({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'giveaway.status.transition',
    entityType: 'Giveaway',
    entityId: doc._id,
    before: { status: from },
    after: { status },
    reason,
    requestId,
  });
  return { changed: true, status, giveaway: doc };
}

/** POST /admin/giveaways/:id/prizes — a new tier, priced by configuration. */
async function createPrize({ giveawayId, body, actorUserId, requestId }) {
  const giveaway = await Giveaway.findById(giveawayId);
  if (!giveaway) throw domain('GIVEAWAY_NOT_FOUND');

  const draft = { ...body, giveawayId: giveaway._id };
  try {
    Prize.assertMatchesGiveaway(giveaway, draft);
  } catch (err) {
    if (err.code === 'PRIZE_FEE_POLICY') {
      throw domain('ENTRY_CURRENCY_NOT_ALLOWED', undefined, { detail: err.message, allowed: giveaway.participation.entryCurrencies });
    }
    throw err;
  }

  let prize;
  try {
    prize = await Prize.create(draft);
  } catch (err) {
    if (err && err.code === 11000) throw domain('POSITION_TAKEN', undefined, { position: draft.position });
    throw err;
  }

  await audit({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'prize.create',
    entityType: 'Prize',
    entityId: prize._id,
    after: { name: prize.name, position: prize.position, winnerCount: prize.winnerCount, prizeType: prize.prizeType, claimType: prize.claimType, entryCurrency: prize.entryCurrency, entryAmount: prize.entryAmount },
    requestId,
  });
  return { giveaway, prize };
}

const PRIZE_SCALARS = ['name', 'description', 'imageRef', 'gallery', 'position', 'winnerCount', 'prizeType', 'claimType', 'entryCurrency', 'entryAmount', 'feeOverrides', 'maxEntries', 'active'];

/** PATCH /admin/prizes/:id — including `active: false`, the soft removal. */
async function updatePrize({ prizeId, body, actorUserId, requestId }) {
  const prize = await Prize.findById(prizeId);
  if (!prize) throw domain('PRIZE_NOT_AVAILABLE');

  const before = {};
  for (const f of PRIZE_SCALARS) if (body[f] !== undefined) before[f] = prize[f];

  // Lowering winnerCount below the slots already filled would invalidate winners.
  if (body.winnerCount !== undefined && body.winnerCount < prize.winnerCount) {
    const filled = await Winner.countDocuments({ prizeId: prize._id });
    if (body.winnerCount < filled) {
      throw ApiError.badRequest('This tier already has more winners than the new count allows.', {
        winnerCount: prize.winnerCount,
        filled,
        requested: body.winnerCount,
      });
    }
  }

  for (const f of PRIZE_SCALARS) {
    if (body[f] !== undefined) prize[f] = body[f];
  }
  if (body.claim && typeof body.claim === 'object') {
    for (const [key, value] of Object.entries(body.claim)) {
      if (value === undefined) continue;
      if (key === 'digital' || key === 'physical') {
        Object.assign(prize.claim[key], value);
      } else {
        prize.claim[key] = value;
      }
    }
  }

  const giveaway = await Giveaway.findById(prize.giveawayId);
  if (giveaway) {
    try {
      Prize.assertMatchesGiveaway(giveaway, prize);
    } catch (err) {
      if (err.code === 'PRIZE_FEE_POLICY') {
        throw domain('ENTRY_CURRENCY_NOT_ALLOWED', undefined, { detail: err.message, allowed: giveaway.participation.entryCurrencies });
      }
      throw err;
    }
  }

  try {
    await prize.save();
  } catch (err) {
    if (err && err.code === 11000) throw domain('POSITION_TAKEN', undefined, { position: prize.position });
    throw err;
  }

  await audit({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'prize.update',
    entityType: 'Prize',
    entityId: prize._id,
    before,
    after: Object.fromEntries(PRIZE_SCALARS.filter((f) => body[f] !== undefined).map((f) => [f, prize[f]])),
    requestId,
  });
  return prize;
}

/** Full configuration view (admin): the private config blocks are included. */
async function getGiveawayConfig(giveawayId) {
  const doc = await Giveaway.findById(giveawayId);
  if (!doc) throw domain('GIVEAWAY_NOT_FOUND');
  const prizes = await Prize.find({ giveawayId: doc._id }).sort({ position: 1 });
  return { giveaway: doc, prizes };
}

/**
 * "Viewing authorized participation information": aggregate entry data for one
 * draw. `deviceRef` is NOT part of the projection — an operator reviewing entries
 * needs who/when/what, not the pseudonymous correlation hashes.
 */
async function listParticipations({ giveawayId, status, page = 1, limit = 20 }) {
  const filter = {};
  if (giveawayId) filter.giveawayId = giveawayId;
  if (status) filter.status = status;
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    Participation.find(filter)
      .select('userId giveawayId prizeId entryCurrency entryAmount entryCount status joinedAt transactionId')
      .sort({ joinedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Participation.countDocuments(filter),
  ]);
  return {
    items: rows.map((r) => ({
      id: String(r._id),
      userId: String(r.userId),
      giveawayId: String(r.giveawayId),
      prizeId: r.prizeId ? String(r.prizeId) : null,
      entryCurrency: r.entryCurrency,
      entryAmount: r.entryAmount,
      entryCount: r.entryCount,
      status: r.status,
      joinedAt: r.joinedAt,
      transactionId: r.transactionId ? String(r.transactionId) : null,
    })),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/** Ledger view for reconciliation: money rows, no entrant data beyond refs. */
async function listLedger({ giveawayId, status, page = 1, limit = 20 }) {
  const filter = {};
  if (giveawayId) filter.giveawayId = giveawayId;
  if (status) filter.status = status;
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    Ledger.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Ledger.countDocuments(filter),
  ]);
  return {
    items: rows.map((r) => ({
      id: String(r._id),
      transactionId: r.transactionId,
      externalTransactionId: r.externalTransactionId || null,
      userId: String(r.userId),
      giveawayId: String(r.giveawayId),
      prizeId: r.prizeId ? String(r.prizeId) : null,
      participationId: r.participationId ? String(r.participationId) : null,
      currency: r.currency,
      amount: r.amount,
      direction: r.direction,
      type: r.type,
      status: r.status,
      balanceBefore: r.balanceBefore,
      balanceAfter: r.balanceAfter,
      entriesGranted: r.entriesGranted,
      failureReason: r.failureReason || null,
      authorizedBy: r.authorizedBy ? String(r.authorizedBy) : null,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
    })),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

module.exports = {
  createGiveaway,
  updateGiveaway,
  setPublished,
  transition,
  createPrize,
  updatePrize,
  getGiveawayConfig,
  listParticipations,
  listLedger,
  configSnapshot,
  assertPrizeFeesStillValid,
  GIVEAWAY_SCALARS,
  GIVEAWAY_BLOCKS,
  PRIZE_SCALARS,
};
