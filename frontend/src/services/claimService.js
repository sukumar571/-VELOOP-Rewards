/**
 * ============================================================================
 * CLAIM SERVICE — the single, server-authoritative boundary for prize claims.
 * ============================================================================
 * Mock path (isMockEnabled()) preserves the exact behavior and shapes the
 * existing components and tests rely on. Live path calls /api/v1: a claim is
 * keyed by its OWN id (resolved from the caller's my-status), ownership is
 * enforced by the server (a non-owner is answered 404, which we surface as a
 * safe FORBIDDEN), and required fields/deadline/status come back from the API.
 * `isWinner`/`canClaim` are DISPLAY ONLY — submitClaim re-authorizes everything
 * server-side, so client-side winner matching is never a permission.
 * ========================================================================= */
import { isMockEnabled } from '../config/env.js';
import { GIVEAWAYS, statusOf } from '../mocks/giveaways.mock.js';
import { CLAIM_RECORDS, DEMO_DATA as CLAIMS_ARE_DEMO } from '../mocks/claims.mock.js';
import { getPrizeType } from '../config/prizeTypes.js';
import {
  getClaimFields,
  validateClaimFields,
  pickClaimFields,
  publicFieldViews,
} from '../config/claimFields.js';
import { CLAIM_STATUS } from '../config/claimStatus.js';
import { _store, isAuthenticatedSync } from './sessionService.js';
import { ServiceError } from './giveawayService.js';
import { toServiceError } from '../api/errors.js';
import * as claimsApi from '../api/claimsApi.js';
import * as participationApi from '../api/participationApi.js';
import * as giveawaysApi from '../api/giveawaysApi.js';
import { ApiClientError } from '../api/client.js';

export { ServiceError };
export const IS_DEMO = isMockEnabled() && CLAIMS_ARE_DEMO;

const LATENCY_MS = 350;
const STORAGE_KEY = 'veloop.demo.claims.v1';

/**
 * Physical fulfilment country. The claim form is deliberately India-scoped
 * (a 6-digit PIN, rupee pricing), so the deployment locale is the country the
 * address is already known to be in. A multi-country programme must add an
 * explicit country input; that is a business configuration decision, not a
 * value this client is allowed to invent per-user.
 */
const DEFAULT_CLAIM_COUNTRY = 'IN';

function respond(data) {
  return new Promise((resolve) =>
    setTimeout(() => resolve(structuredClone(data)), LATENCY_MS),
  );
}

/* -------------------------------------------------------------------------- */
/* MOCK ledger (development path)                                              */
/* -------------------------------------------------------------------------- */

function readOverrides() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function seedLedger() {
  const overrides = readOverrides();
  const map = new Map();
  for (const r of CLAIM_RECORDS) {
    const rec = { ...r };
    const o = overrides[r.giveawayId];
    if (o) {
      if (o.status) rec.status = o.status;
      if (o.submittedAt) rec.submittedAt = o.submittedAt;
      if (o.fulfillment) rec.fulfillment = o.fulfillment;
    }
    map.set(r.giveawayId, rec);
  }
  return map;
}
let ledger = seedLedger();

function persistLedger() {
  try {
    const overrides = {};
    for (const [id, rec] of ledger) {
      if (rec.status !== CLAIM_STATUS.NOT_SUBMITTED || rec.submittedAt || rec.fulfillment) {
        overrides[id] = {
          status: rec.status,
          submittedAt: rec.submittedAt,
          fulfillment: rec.fulfillment,
        };
      }
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    /* ignore */
  }
}

/** DEV/TEST ONLY — reset the mock ledger to its seeded state. Not a real API. */
export function __resetClaimState() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  ledger = seedLedger();
}

function findGiveaway(giveawayId) {
  return GIVEAWAYS.find((g) => g.id === giveawayId) ?? null;
}
function deliveryModeOfGiveaway(giveaway) {
  return getPrizeType(giveaway.prizeType).deliveryMode;
}
function effectiveStatus(rec, now) {
  if (rec.status === CLAIM_STATUS.NOT_SUBMITTED && now > rec.deadline) return CLAIM_STATUS.EXPIRED;
  return rec.status;
}

/* -------------------------------------------------------------------------- */
/* Public surface                                                              */
/* -------------------------------------------------------------------------- */

export async function getClaimContext(giveawayId) {
  if (isMockEnabled()) return mockClaimContext(giveawayId);
  return apiClaimContext(giveawayId);
}

async function mockClaimContext(giveawayId) {
  const g = findGiveaway(giveawayId);
  if (!g) throw new ServiceError('NOT_FOUND', 'Unknown giveaway');
  const now = Date.now();
  const published = statusOf(g, now) === 'ended';
  const userId = _store.getUserId();
  const rec = ledger.get(giveawayId);
  const isWinner = !!(userId && rec && rec.userId === userId && published);
  const status = rec ? effectiveStatus(rec, now) : null;
  const deliveryMode = deliveryModeOfGiveaway(g);
  return respond({
    authenticated: !!userId,
    published,
    isWinner,
    giveawayId: g.id,
    giveawaySlug: g.slug,
    giveawayTitle: g.title,
    prize: g.tagline || g.title,
    deliveryMode,
    fields: publicFieldViews(getClaimFields(deliveryMode)),
    status,
    deadline: rec?.deadline ?? null,
    canClaim:
      isWinner && published && status === CLAIM_STATUS.NOT_SUBMITTED && now <= rec.deadline,
  });
}

async function apiClaimContext(giveawayId) {
  if (!isAuthenticatedSync()) {
    return {
      authenticated: false,
      published: false,
      isWinner: false,
      giveawayId,
      giveawaySlug: null,
      giveawayTitle: null,
      prize: null,
      claimId: null,
      deliveryMode: 'none',
      fields: [],
      status: null,
      deadline: null,
      canClaim: false,
    };
  }
  let giveaway;
  let myStatus;
  try {
    giveaway = await giveawaysApi.getById(giveawayId);
    myStatus = await participationApi.myStatus(giveawayId);
  } catch (err) {
    throw toServiceError(err, { claim: true });
  }

  const claimStub = myStatus?.claim || null;
  const isWinner = Boolean(myStatus?.isWinner);
  let claimDetail = null;
  if (isWinner && claimStub?.id) {
    claimDetail = await claimsApi.getById(claimStub.id).catch(() => claimStub);
  }

  const deliveryMode = claimDetail
    ? modeFromClaim(claimDetail)
    : 'none';
  const fields = publicFieldViews(getClaimFields(deliveryMode));

  const ctx = buildContextFromApi(giveaway, myStatus, claimDetail || claimStub, fields, isWinner);
  return ctx;
}

/** Map a backend claim (claimType/prizeType) onto the UI delivery mode. */
function modeFromClaim(claim) {
  const ct = claim.claimType;
  if (ct === 'FORM') return 'physical';
  if (ct === 'DIGITAL_DELIVERY') return 'digital';
  if (ct === 'AUTOMATIC') return 'none';
  const pt = claim.prizeType;
  if (pt === 'GIFT_CARD' || pt === 'DIGITAL') return 'digital';
  if (pt === 'PHYSICAL') return 'physical';
  return 'none';
}

function buildContextFromApi(giveaway, myStatus, claim, fields, isWinner) {
  const status = mapStatus(giveaway.status);
  const published = status === 'ended';
  const claimStatus = claim?.status ?? null;
  const deadline = claim?.deadlineAt ? new Date(claim.deadlineAt).getTime() : null;
  const canClaim = Boolean(
    isWinner &&
      claim &&
      (claim.canSubmit ??
        (claimStatus === CLAIM_STATUS.NOT_SUBMITTED &&
          !claim.expired &&
          deadline != null &&
          deadline > Date.now())),
  );
  return {
    authenticated: true,
    published,
    isWinner,
    giveawayId: giveaway.id,
    giveawaySlug: giveaway.slug || null,
    giveawayTitle: giveaway.title,
    prize: giveaway.tagline || giveaway.title,
    claimId: claim?.id ?? null,
    deliveryMode: fields.length ? (claim && modeFromClaim(claim)) || 'physical' : 'none',
    fields,
    status: claimStatus,
    deadline,
    canClaim,
  };
}

function mapStatus(s) {
  if (s === 'ACTIVE') return 'active';
  if (s === 'UPCOMING') return 'upcoming';
  return 'ended';
}

export async function getMyWonRecords() {
  if (isMockEnabled()) return mockMyWonRecords();
  return apiMyWonRecords();
}

async function mockMyWonRecords() {
  const userId = _store.getUserId();
  if (!userId) return respond([]);
  const now = Date.now();
  const list = [];
  for (const rec of ledger.values()) {
    if (rec.userId !== userId) continue;
    const g = findGiveaway(rec.giveawayId);
    if (!g || statusOf(g, now) !== 'ended') continue;
    const deliveryMode = deliveryModeOfGiveaway(g);
    const status = effectiveStatus(rec, now);
    list.push({
      giveawayId: g.id,
      giveawaySlug: g.slug,
      giveawayTitle: g.title,
      prize: g.tagline || g.title,
      deliveryMode,
      fields: publicFieldViews(getClaimFields(deliveryMode)),
      status,
      deadline: rec.deadline,
      canClaim: status === CLAIM_STATUS.NOT_SUBMITTED && now <= rec.deadline,
    });
  }
  list.sort((a, b) => (a.deadline ?? 0) - (b.deadline ?? 0));
  return respond(list);
}

async function apiMyWonRecords() {
  if (!isAuthenticatedSync()) return [];
  let claims;
  let myStatus;
  try {
    [claims, myStatus] = await Promise.all([
      claimsApi.list({ limit: 100 }),
      participationApi.myParticipations({ limit: 100 }),
    ]);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 401) return [];
    throw toServiceError(err, { claim: true });
  }

  const giveawayById = new Map(
    (myStatus.items || []).map((i) => [String(i.giveawayId), i.giveaway || {}]),
  );

  const list = (claims.items || [])
    .filter((c) => c.resultsPublished !== false) // never show an unpublished win
    .map((c) => {
      const meta = giveawayById.get(String(c.giveawayId)) || { id: c.giveawayId };
      const deliveryMode = modeFromClaim(c);
      const fields = publicFieldViews(getClaimFields(deliveryMode));
      return {
        giveawayId: meta.id ?? c.giveawayId,
        giveawaySlug: meta.slug ?? null,
        giveawayTitle: meta.title ?? null,
        prize: meta.title ?? null,
        claimId: c.id,
        deliveryMode,
        fields,
        status: c.status ?? null,
        deadline: c.deadlineAt ? new Date(c.deadlineAt).getTime() : null,
        canClaim: Boolean(c.canSubmit),
      };
    });

  list.sort((a, b) => (a.deadline ?? 0) - (b.deadline ?? 0));
  return list;
}

/**
 * Submit / fulfil a prize claim. The caller sends ONLY the fulfilment values;
 * winner identity, ownership, deadline, status and required fields are all
 * re-checked server-side. Non-winners have no claim row for this draw, so the
 * id cannot even be resolved — and a direct POST to another winner's claim id
 * is answered 404 (mapped here to a safe FORBIDDEN).
 */
export async function submitClaim(giveawayId, values = {}) {
  if (isMockEnabled()) return mockSubmitClaim(giveawayId, values);
  return apiSubmitClaim(giveawayId, values);
}

async function mockSubmitClaim(giveawayId, values = {}) {
  const userId = _store.getUserId();
  if (!userId) throw new ServiceError('NOT_AUTHENTICATED', 'Please sign in to claim this prize.');
  const g = findGiveaway(giveawayId);
  if (!g) throw new ServiceError('NOT_FOUND', 'Unknown giveaway');
  const now = Date.now();
  if (statusOf(g, now) !== 'ended') {
    throw new ServiceError('NOT_PUBLISHED', 'Winners for this draw have not been published yet.');
  }
  const rec = ledger.get(giveawayId);
  if (!rec || rec.userId !== userId) {
    throw new ServiceError('FORBIDDEN', 'You are not authorized to claim this prize.');
  }
  const status = effectiveStatus(rec, now);
  if (status === CLAIM_STATUS.EXPIRED) {
    rec.status = CLAIM_STATUS.EXPIRED;
    throw new ServiceError('EXPIRED', 'The claim deadline for this prize has passed.');
  }
  if (status === CLAIM_STATUS.SUBMITTED || status === CLAIM_STATUS.PROCESSING) {
    throw new ServiceError('ALREADY_SUBMITTED', 'Your claim has already been submitted.');
  }
  if (status === CLAIM_STATUS.COMPLETED) {
    throw new ServiceError('ALREADY_COMPLETED', 'This prize has already been claimed.');
  }
  const deliveryMode = deliveryModeOfGiveaway(g);
  const errors = validateClaimFields(deliveryMode, values);
  if (Object.keys(errors).length) {
    const err = new ServiceError('VALIDATION', 'Please correct the highlighted fields.');
    err.fields = errors;
    throw err;
  }
  rec.fulfillment = pickClaimFields(deliveryMode, values);
  rec.status = CLAIM_STATUS.SUBMITTED;
  rec.submittedAt = now;
  persistLedger();
  return respond({
    ok: true,
    giveawayId,
    status: CLAIM_STATUS.SUBMITTED,
    deliveryMode,
    submittedAt: now,
  });
}

async function apiSubmitClaim(giveawayId, values = {}) {
  if (!isAuthenticatedSync()) {
    throw new ServiceError('NOT_AUTHENTICATED', 'Please sign in to claim this prize.');
  }

  // Resolve the caller's claim id for this draw — a non-winner has none.
  let myStatus;
  try {
    myStatus = await participationApi.myStatus(giveawayId);
  } catch (err) {
    throw toServiceError(err, { claim: true });
  }
  const claimId = myStatus?.claim?.id;
  if (!myStatus?.isWinner || !claimId) {
    throw new ServiceError('FORBIDDEN', 'You are not authorized to claim this prize.');
  }

  // The claim's own record decides the required shape (never the client).
  const claim = await claimsApi.getById(claimId).catch(() => null);
  const deliveryMode = claim ? modeFromClaim(claim) : 'physical';

  // Client-side sanity first (mirrors the schema) so obvious gaps are per-field.
  const clientErrors = validateClaimFields(deliveryMode, values);
  if (Object.keys(clientErrors).length) {
    const err = new ServiceError('VALIDATION', 'Please correct the highlighted fields.');
    err.fields = clientErrors;
    throw err;
  }

  const fulfillment = buildFulfillment(deliveryMode, values);

  try {
    const result = await claimsApi.submit(claimId, fulfillment);
    return {
      ok: true,
      giveawayId,
      claimId,
      status: result?.status ?? CLAIM_STATUS.SUBMITTED,
      deliveryMode,
      submittedAt: result?.submittedAt ? new Date(result.submittedAt).getTime() : Date.now(),
    };
  } catch (err) {
    throw toServiceError(err, { claim: true });
  }
}

/** Assemble the exact fulfilment payload the strict validator + service want. */
function buildFulfillment(deliveryMode, values) {
  if (deliveryMode === 'digital') {
    return { digital: { deliveryEmail: String(values.deliveryEmail || '').trim() } };
  }
  return {
    physical: {
      fullName: str(values.fullName),
      phone: str(values.phone),
      address: str(values.address),
      city: str(values.city),
      state: str(values.state),
      postalCode: str(values.pin), // form field `pin` -> API `postalCode`
      country: DEFAULT_CLAIM_COUNTRY,
    },
  };
}

const str = (v) => (v == null ? '' : String(v).trim());
