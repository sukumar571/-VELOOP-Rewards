/**
 * ============================================================================
 * CLAIM SERVICE — the winner's side and the operator's side of fulfilment.
 * ============================================================================
 * Access rule first: a claim carries the winner's address or delivery target, so
 * every read goes through `PrizeClaim.findScoped` / `canBeReadBy` — the scope is
 * applied HERE and in the model, so a forgotten `where` in a controller cannot
 * leak another winner's PII. A non-owner asking for a claim they cannot see gets
 * 404, not 403: an existence answer would itself be a leak.
 *
 * The required fulfilment shape comes from `CLAIM_TYPE_FULFILMENT_SHAPE` (the
 * claim type copied onto the claim at draw time) — never from a prize name.
 * A deadline is absolute: a late winner cannot submit until an operator has
 * EXTENDED it, and that extension is an audited action.
 * ========================================================================= */
const PrizeClaim = require('../models/prizeClaim.model.js');
const GiveawayWinner = require('../models/giveawayWinner.model.js');
const Prize = require('../models/prize.model.js');
const AuditLog = require('../models/auditLog.model.js');
const { domain } = require('../utils/domainErrors.js');
const { ApiError } = require('../utils/ApiError.js');
const {
  CLAIM_STATUS,
  CLAIM_TYPE,
  CLAIM_TYPE_FULFILMENT_SHAPE,
} = require('../config/constants.js');

const DAY_MS = 86_400_000;
const COUNTRY_RE = /^[A-Z]{2}$/;

const maskEmail = (email) => {
  const [local, domainPart] = String(email).split('@');
  if (!domainPart) return '•••';
  return `${(local || '').slice(0, 2)}•••@${domainPart}`;
};

/** The winner's own view: safe for any surface they can reach. */
const publicView = (claim) => claim.toPublicJSON();

/**
 * Server-side rule check before the model's validation runs, so a rejected claim
 * gets `CLAIM_DETAILS_INVALID` with the missing fields instead of a generic 400.
 */
function validateFulfilment(claim, fulfillment = {}) {
  const shape = CLAIM_TYPE_FULFILMENT_SHAPE[claim.claimType];

  if (shape === 'none') {
    throw domain('CLAIM_DETAILS_INVALID', 'This prize is issued automatically; no details are required.', {
      claimType: claim.claimType,
    });
  }

  if (shape === 'physical') {
    const p = fulfillment.physical || {};
    const missing = PrizeClaim.REQUIRED_PHYSICAL_FIELDS.filter((k) => !p[k]);
    if (COUNTRY_RE.test(String(p.country || '').toUpperCase()) === false) missing.push('country');
    if (missing.length) throw domain('CLAIM_DETAILS_INVALID', undefined, { missing, required: PrizeClaim.REQUIRED_PHYSICAL_FIELDS });
    return { physical: { ...p, country: String(p.country).toUpperCase() } };
  }

  const d = fulfillment.digital || {};
  if (!d.deliveryEmail) {
    throw domain('CLAIM_DETAILS_INVALID', undefined, { missing: ['deliveryEmail'] });
  }
  return { digital: { deliveryEmail: d.deliveryEmail, deliveryTargetMasked: maskEmail(d.deliveryEmail) } };
}

/** Physical prizes ship to a configured country list; that is configuration too. */
async function assertShipsTo(claim, country) {
  if (CLAIM_TYPE_FULFILMENT_SHAPE[claim.claimType] !== 'physical') return true;
  const prize = await Prize.findById(claim.prizeId).select('claim').lean();
  const allowed = prize?.claim?.physical?.shipToCountries || [];
  if (allowed.length && !allowed.includes(country)) {
    throw domain('CLAIM_DETAILS_INVALID', 'This prize does not ship to the address country provided.', {
      country,
      allowedCountries: allowed,
    });
  }
  return true;
}

/** Winner (or an operator acting on their behalf in REVIEW only) loads a claim. */
async function loadClaim({ claimId, userId, isAdmin }) {
  const claim = isAdmin
    ? await PrizeClaim.findById(claimId)
    : await PrizeClaim.findOne({ _id: claimId, userId });
  // 404 for "not yours" as well as "does not exist".
  if (!claim) throw domain('CLAIM_NOT_FOUND');
  return claim;
}

async function myClaims({ userId, status, giveawayId, page = 1, limit = 20 }) {
  const filter = { userId };
  if (status) filter.status = status;
  if (giveawayId) filter.giveawayId = giveawayId;
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    PrizeClaim.find(filter).sort({ deadlineAt: 1 }).skip(skip).limit(limit),
    PrizeClaim.countDocuments(filter),
  ]);
  const winners = rows.length
    ? await GiveawayWinner.find({ _id: { $in: rows.map((r) => r.winnerId) } })
      .select('rank announcementStatus displayInfo').lean()
    : [];
  const byWinner = new Map(winners.map((w) => [String(w._id), w]));

  return {
    items: rows.map((c) => ({
      ...publicView(c),
      rank: byWinner.get(String(c.winnerId))?.rank ?? null,
      resultsPublished: byWinner.get(String(c.winnerId))?.announcementStatus === 'ANNOUNCED',
      // What the winner can actually do right now, computed once server-side.
      action: c.isExpired()
        ? 'EXPIRED'
        : c.status === CLAIM_STATUS.NOT_SUBMITTED
          ? 'SUBMIT_DETAILS'
          : c.status === CLAIM_STATUS.SUBMITTED
            ? 'AWAIT_REVIEW'
            : c.status === CLAIM_STATUS.PROCESSING
              ? 'AWAIT_FULFILMENT'
              : 'NONE',
    })),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

async function getClaim({ claimId, auth }) {
  const claim = await loadClaim({ claimId, userId: auth.userId, isAdmin: auth.isAdmin });
  if (auth.isAdmin) {
    // Operators need the fulfilment to ship the prize; the model only hands it to
    // a caller that has already been authorized for it.
    return { view: 'admin', data: claim.toJSON({ includePrivate: true }) };
  }
  return { view: 'owner', data: { ...publicView(claim), fulfillment: maskedFulfillment(claim) } };
}

/** The owner may see WHAT they submitted, masked — never the raw stored value. */
function maskedFulfillment(claim) {
  const f = claim.fulfillment || {};
  const out = {};
  if (f.physical?.address) out.physical = { addressLine1Masked: '•••••', city: f.physical.city, country: f.physical.country, postalCode: f.physical.postalCode };
  if (f.digital?.deliveryTargetMasked) out.digital = { deliveryTargetMasked: f.digital.deliveryTargetMasked };
  return out;
}

/** POST /claims/:id/submit — the winner supplies their fulfilment details. */
async function submitClaim({ claimId, userId, fulfillment, requestId }) {
  const claim = await loadClaim({ claimId, userId, isAdmin: false });

  if (claim.status !== CLAIM_STATUS.NOT_SUBMITTED) {
    throw domain('CLAIM_ALREADY_SUBMITTED', undefined, { status: claim.status });
  }
  if (claim.deadlineAt < new Date()) {
    throw domain('CLAIM_EXPIRED', 'The claim deadline has passed. An operator can extend it; the extension is audited.', {
      deadlineAt: claim.deadlineAt,
    });
  }

  const clean = validateFulfilment(claim, fulfillment);
  if (clean.physical) await assertShipsTo(claim, clean.physical.country);

  claim.fulfillment = clean;
  claim.status = CLAIM_STATUS.SUBMITTED;
  await claim.save();

  await AuditLog.record({
    actorId: userId,
    actorRole: 'user',
    action: 'claim.submit',
    entityType: 'PrizeClaim',
    entityId: claim._id,
    // Never snapshot the fulfilment itself: the audit trail needs the SHAPE, not PII.
    after: { claimType: claim.claimType, fields: Object.keys(clean)[0] },
    requestId,
  }).catch(() => null);

  return { ...publicView(claim), fulfillment: maskedFulfillment(claim) };
}

/** Admin review: SUBMITTED -> PROCESSING, PROCESSING -> COMPLETED or back. */
async function reviewClaim({ claimId, status, note, actorUserId, requestId }) {
  const claim = await loadClaim({ claimId, userId: null, isAdmin: true });
  const from = claim.status;
  const allowed = PrizeClaim.STATUS_TRANSITIONS[from] || [];
  if (!allowed.includes(status)) {
    throw domain('CLAIM_DETAILS_INVALID', `A claim in status ${from} cannot move to ${status}.`, {
      from,
      allowed,
    });
  }
  if (note) claim.internalNote = String(note).slice(0, 1000);
  claim.status = status;
  await claim.save();

  await AuditLog.record({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'claim.review',
    entityType: 'PrizeClaim',
    entityId: claim._id,
    before: { status: from },
    after: { status },
    reason: note ? 'note recorded' : undefined,
    requestId,
  }).catch(() => null);

  return claim.toJSON({ includePrivate: true });
}

/**
 * Extending a deadline is the ONLY legitimate way a late submission is accepted.
 * An already-EXPIRED claim cannot be revived (the model makes EXPIRED terminal),
 * so that case is refused with an explanation rather than a silent no-op.
 */
async function extendClaim({ claimId, days, until, reason, actorUserId, requestId }) {
  const claim = await loadClaim({ claimId, userId: null, isAdmin: true });
  if (claim.status === CLAIM_STATUS.EXPIRED) {
    throw domain('CLAIM_EXPIRED', 'An expired claim cannot be reopened; the prize slot stays closed.', {
      status: claim.status,
      deadlineAt: claim.deadlineAt,
    });
  }
  const before = claim.deadlineAt;
  const next = until ? new Date(until) : new Date(Date.now() + days * DAY_MS);
  if (Number.isNaN(next.getTime())) throw ApiError.badRequest('The new deadline is not a valid date.');
  if (next <= before) throw ApiError.badRequest('A deadline can only be extended forwards.', { deadlineAt: before });

  claim.deadlineAt = next;
  if (reason) claim.internalNote = String(reason).slice(0, 1000);
  await claim.save();

  await AuditLog.record({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'claim.deadline.extend',
    entityType: 'PrizeClaim',
    entityId: claim._id,
    before: { deadlineAt: before },
    after: { deadlineAt: next },
    reason,
    requestId,
  }).catch(() => null);

  return { id: String(claim._id), deadlineAt: claim.deadlineAt, extendedFrom: before };
}

/** Sweep: open claims past their deadline become EXPIRED (auditable, reversible? no). */
async function expireOverdue({ actorUserId, giveawayId, requestId }) {
  const filter = { status: CLAIM_STATUS.NOT_SUBMITTED, deadlineAt: { $lt: new Date() } };
  if (giveawayId) filter.giveawayId = giveawayId;
  const rows = await PrizeClaim.find(filter);
  const expired = [];
  for (const claim of rows) {
    claim.status = CLAIM_STATUS.EXPIRED;
    await claim.save();
    expired.push(String(claim._id));
  }
  if (expired.length) {
    await AuditLog.record({
      actorId: actorUserId,
      actorRole: 'admin',
      action: 'claim.expire_sweep',
      entityType: 'PrizeClaim',
      entityId: giveawayId || 'all',
      after: { expired: expired.length },
      requestId,
    }).catch(() => null);
  }
  return { expired: expired.length, ids: expired };
}

/** Operator queue. The fulfilment block is included because shipping needs it. */
async function adminListClaims({ status, giveawayId, claimType, page = 1, limit = 20 }) {
  const filter = {};
  if (status) filter.status = status;
  if (giveawayId) filter.giveawayId = giveawayId;
  if (claimType) filter.claimType = claimType;
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    PrizeClaim.find(filter).sort({ deadlineAt: 1 }).skip(skip).limit(limit),
    PrizeClaim.countDocuments(filter),
  ]);
  return {
    items: rows.map((c) => c.toJSON({ includePrivate: true })),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

module.exports = {
  myClaims,
  getClaim,
  submitClaim,
  reviewClaim,
  extendClaim,
  expireOverdue,
  adminListClaims,
  validateFulfilment,
  loadClaim,
  maskEmail,
  publicView,
};
