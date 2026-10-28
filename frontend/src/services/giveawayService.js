/**
 * ============================================================================
 * Giveaway service layer — the single data boundary for all pages.
 * ============================================================================
 * Today every function resolves from the mock modules with a simulated
 * network latency (so loading states are exercised honestly). At backend
 * integration, replace each body with a fetch() to /api/v1/* (docs/PLAN.md —
 * D); signatures and returned shapes stay identical, so no component changes.
 * NO component imports from src/mocks directly.
 * ========================================================================= */
import {
  DEMO_DATA as GIVEAWAYS_ARE_DEMO,
  GIVEAWAYS,
  decorate,
} from '../mocks/giveaways.mock.js';
import { WINNERS } from '../mocks/winners.mock.js';
import {
  DEMO_DATA as PROGRAMME_IS_DEMO,
  PROGRAMME_RULES,
  FAQS,
  ELIGIBILITY_REQUIREMENTS,
  TERMS_AND_CONDITIONS,
  IMPORTANT_INFO,
} from '../mocks/programme.mock.js';
import { statusOf } from '../mocks/giveaways.mock.js';
import { maskWinnerRecord } from '../utils/mask.js';
import { _store } from './sessionService.js';

export const IS_DEMO = GIVEAWAYS_ARE_DEMO && PROGRAMME_IS_DEMO;

/** Simulated round-trip; delete this when real HTTP calls land. */
const LATENCY_MS = 350;

/** Demo additive join counter so a successful entry nudges the participant
 *  figure returned by subsequent reads (a real backend owns this count). */
const joinCounts = {};

/** Decorate with lifecycle state AND derived participant count. */
function present(giveaway, now = Date.now()) {
  const d = decorate(giveaway, now);
  d.participants = (giveaway.participants || 0) + (joinCounts[giveaway.id] || 0);
  return d;
}

function respond(data) {
  return new Promise((resolve) =>
    setTimeout(() => resolve(structuredClone(data)), LATENCY_MS),
  );
}

export class ServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/* -------------------------------------------------------------------------- */
/* Giveaways                                                                   */
/* -------------------------------------------------------------------------- */

export async function getGiveaways() {
  const now = Date.now();
  return respond(
    GIVEAWAYS.map((g) => present(g, now)).sort((a, b) => {
      const rank = { active: 0, upcoming: 1, ended: 2 };
      return rank[a.status] - rank[b.status] || a.endsAt - b.endsAt;
    }),
  );
}

/** Featured = ACTIVE draws for the homepage grid. */
export async function getFeaturedGiveaways() {
  const all = await getGiveaways();
  return all.filter((g) => g.status === 'active');
}

export async function getGiveawayBySlug(slug) {
  const now = Date.now();
  const found = GIVEAWAYS.find((g) => g.slug === slug);
  if (!found) throw new ServiceError('NOT_FOUND', `No giveaway "${slug}"`);
  return respond(present(found, now));
}

/* -------------------------------------------------------------------------- */
/* Stats — derived from mock data; flag as demo so UI never claims liveness   */
/* -------------------------------------------------------------------------- */

export async function getProgrammeStats() {
  const now = Date.now();
  const decorated = GIVEAWAYS.map((g) => present(g, now));
  const active = decorated.filter((g) => g.status === 'active');
  return respond({
    isDemo: IS_DEMO,
    activeCount: active.length,
    totalGiveaways: decorated.length,
    totalParticipants: decorated.reduce((s, g) => s + (g.participants || 0), 0),
    prizesAwarded: WINNERS.length,
    nextEndsAt: active.length ? Math.min(...active.map((g) => g.endsAt)) : null,
  });
}

/* -------------------------------------------------------------------------- */
/* Winners                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Business rules enforced HERE (not just in components):
 * 1. Winner records exist only for ENDED giveaways; verify before serving.
 * 2. Every record keeps its original giveawayId association.
 * 3. Defensive PII masking applied on every read.
 */
function publishedWinnersForEndedGiveaways() {
  const byId = new Map(GIVEAWAYS.map((g) => [g.id, g]));
  const now = Date.now();
  return WINNERS.filter((w) => {
    const g = byId.get(w.giveawayId);
    // Archived draws (no live record) are treated as ended history.
    return !g || statusOf(g, now) === 'ended';
  }).map(maskWinnerRecord);
}

/** Most recently announced winners (for the announcement slider). */
export async function getRecentWinners() {
  const all = publishedWinnersForEndedGiveaways();
  return respond(
    [...all]
      .sort((a, b) => b.announcedAt - a.announcedAt)
      .slice(0, 4),
  );
}

/** Historical list: giveaway name, prize, date, masked identity. */
export async function getPreviousWinners() {
  const all = publishedWinnersForEndedGiveaways();
  return respond(
    [...all].sort((a, b) => b.announcedAt - a.announcedAt),
  );
}

/** Winners of ONE giveaway — served only when that giveaway is ENDED. */
export async function getWinnersForGiveaway(giveawayId) {
  const g = GIVEAWAYS.find((x) => x.id === giveawayId);
  const now = Date.now();
  // ACTIVE/UPCOMING draws never expose winner rows (no false announcements).
  if (g && statusOf(g, now) !== 'ended') {
    return respond([]);
  }
  return respond(
    publishedWinnersForEndedGiveaways().filter((w) => w.giveawayId === giveawayId),
  );
}

/* -------------------------------------------------------------------------- */
/* Programme content                                                           */
/* -------------------------------------------------------------------------- */

export async function getProgrammeRules() {
  return respond(PROGRAMME_RULES);
}

export async function getFaqs() {
  return respond(FAQS);
}

export async function getEligibilityRequirements() {
  return respond(ELIGIBILITY_REQUIREMENTS);
}

export async function getTermsAndConditions() {
  return respond(TERMS_AND_CONDITIONS);
}

export async function getImportantInfo() {
  return respond(IMPORTANT_INFO);
}

/* -------------------------------------------------------------------------- */
/* Participation (entry) — the backend API boundary                           */
/* -------------------------------------------------------------------------- */

/**
 * Entry state for one giveaway, assembled AUTHORITATIVELY from the session
 * store + config. The UI renders from this; it never trusts a client-held
 * balance or fee. The fee/balance shown here are the same objects joinGiveaway
 * re-checks, so what the user sees is exactly what the (future) server charges.
 */
export async function getEntryState(giveawayId) {
  const g = GIVEAWAYS.find((x) => x.id === giveawayId);
  if (!g) throw new ServiceError('NOT_FOUND', 'Unknown giveaway');
  const now = Date.now();
  const status = statusOf(g, now);

  if (!_store.isLoggedIn()) {
    return respond({
      authenticated: false,
      status,
      entry: g.entry,
      hasJoined: false,
      eligible: true,
      balance: null,
    });
  }

  const balance = _store.getBalance(g.entry.currency);
  const hasJoined = _store.hasJoined(g.id);
  const eligible = _store.isEligible();
  const fee = g.entry.amount; // authoritative, read from config
  return respond({
    authenticated: true,
    status,
    entry: g.entry,
    fee,
    balance,
    eligible,
    hasJoined,
    sufficient: balance >= fee,
    projectedAfter: balance - fee, // display-only preview
  });
}

/**
 * Join a giveaway. This represents POST /api/v1/giveaways/:id/entries.
 * The caller passes ONLY the giveaway id — never a fee or a balance — and every
 * value below is re-read from the authoritative config/session store, so a
 * tampered client cannot change what is charged or whether the join succeeds.
 * All the following are enforced HERE, server-side style:
 *   auth → lifecycle → eligibility → already-joined → sufficient balance.
 * On success it debits the (server) wallet and records the entry, then returns
 * a receipt. It does NOT touch React state — the UI refetches after this.
 */
export async function joinGiveaway(giveawayId) {
  const g = GIVEAWAYS.find((x) => x.id === giveawayId);
  if (!g) throw new ServiceError('NOT_FOUND', 'Unknown giveaway');

  const now = Date.now();
  const status = statusOf(g, now);

  if (!_store.isLoggedIn()) {
    throw new ServiceError('NOT_AUTHENTICATED', 'Please sign in to enter this giveaway.');
  }
  if (status === 'upcoming') {
    throw new ServiceError('UPCOMING', 'Entries for this giveaway have not opened yet.');
  }
  if (status === 'ended') {
    throw new ServiceError('ENDED', 'The entry window for this giveaway has closed.');
  }
  if (!_store.isEligible()) {
    throw new ServiceError('INELIGIBLE', 'This account is not eligible to enter this giveaway.');
  }
  if (_store.hasJoined(giveawayId)) {
    throw new ServiceError('ALREADY_JOINED', 'You have already entered this giveaway.');
  }

  // Authoritative fee + balance (client value is never consulted).
  const { currency } = g.entry;
  const fee = g.entry.amount;
  const balanceBefore = _store.getBalance(currency);
  if (balanceBefore < fee) {
    throw new ServiceError(
      'INSUFFICIENT_BALANCE',
      `You need ${fee} ${currency} to enter but your balance is ${balanceBefore}.`,
    );
  }

  // Charge + record on the authoritative store, then reflect in derived data.
  _store.deduct(currency, fee);
  _store.addJoin(giveawayId);
  joinCounts[giveawayId] = (joinCounts[giveawayId] || 0) + 1;

  return respond({
    ok: true,
    giveawayId,
    currency,
    fee,
    balanceBefore,
    balanceAfter: balanceBefore - fee,
    participants: (g.participants || 0) + joinCounts[giveawayId],
  });
}
