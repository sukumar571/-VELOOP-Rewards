/**
 * ============================================================================
 * Giveaway service layer — the single data boundary for all giveaway pages.
 * ============================================================================
 * Every export has TWO implementations behind ONE signature:
 *   • the development MOCK path (isMockEnabled()) — unchanged shapes so the
 *     existing components and tests keep working with no network;
 *   • the LIVE API path — real /api/v1 reads mapped onto the SAME shapes by
 *     src/api/normalize.js. When the API is authoritative, a failure raises a
 *     ServiceError; it NEVER silently falls back to fake data.
 * No component imports src/mocks directly, and none needs to change when the
 * live path is switched on.
 * ========================================================================= */
import { isMockEnabled } from '../config/env.js';
import {
  DEMO_DATA as GIVEAWAYS_ARE_DEMO,
  GIVEAWAYS,
  decorate,
  statusOf,
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
import { maskWinnerRecord } from '../utils/mask.js';
import { _store, isAuthenticatedSync } from './sessionService.js';
import * as giveawaysApi from '../api/giveawaysApi.js';
import * as participationApi from '../api/participationApi.js';
import * as walletApi from '../api/walletApi.js';
import * as winnersApi from '../api/winnersApi.js';
import { ApiClientError } from '../api/client.js';
import {
  normalizeGiveaway,
  primaryPrize,
  entryStateFromApi,
  joinReceiptFromApi,
  normalizeWinnerRow,
} from '../api/normalize.js';
import { ServiceError, toServiceError } from '../api/errors.js';

// Re-exported so existing importers (`claimService`, tests) keep their import.
export { ServiceError };

export const IS_DEMO = isMockEnabled() && GIVEAWAYS_ARE_DEMO && PROGRAMME_IS_DEMO;

/* -------------------------------------------------------------------------- */
/* Mock helpers (development path)                                             */
/* -------------------------------------------------------------------------- */

const LATENCY_MS = 350;
const joinCounts = {};

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

/* -------------------------------------------------------------------------- */
/* Giveaways                                                                   */
/* -------------------------------------------------------------------------- */

export async function getGiveaways() {
  if (isMockEnabled()) {
    const now = Date.now();
    return respond(
      GIVEAWAYS.map((g) => present(g, now)).sort((a, b) => {
        const rank = { active: 0, upcoming: 1, ended: 2 };
        return rank[a.status] - rank[b.status] || a.endsAt - b.endsAt;
      }),
    );
  }
  return apiListGiveaways();
}

async function apiListGiveaways(query) {
  try {
    const { items } = await giveawaysApi.list(query);
    return await attachPrizes(items);
  } catch (err) {
    throw toServiceError(err);
  }
}

/** Fetch each draw's tiers (for fee / prize-type) and normalize the UI shape. */
async function attachPrizes(items) {
  const withPrizes = await Promise.all(
    items.map(async (g) => {
      let prizes = [];
      try {
        prizes = await giveawaysApi.prizes(g.id);
      } catch {
        prizes = []; // no tiers surfaced yet -> entry renders as unavailable
      }
      return normalizeGiveaway(g, prizes);
    }),
  );
  const rank = { active: 0, upcoming: 1, ended: 2 };
  return withPrizes.sort(
    (a, b) => rank[a.status] - rank[b.status] || (a.endsAt ?? 0) - (b.endsAt ?? 0),
  );
}

/** Featured = ACTIVE draws for the homepage grid. */
export async function getFeaturedGiveaways() {
  if (isMockEnabled()) {
    const all = await getGiveaways();
    return all.filter((g) => g.status === 'active');
  }
  const all = await apiListGiveaways({ status: 'ACTIVE' });
  return all.filter((g) => g.status === 'active');
}

export async function getGiveawayBySlug(slug) {
  if (isMockEnabled()) {
    const now = Date.now();
    const found = GIVEAWAYS.find((g) => g.slug === slug);
    if (!found) throw new ServiceError('NOT_FOUND', `No giveaway "${slug}"`);
    return respond(present(found, now));
  }
  try {
    const doc = await giveawaysApi.bySlug(slug);
    const prizes = await giveawaysApi.prizes(doc.id).catch(() => []);
    return normalizeGiveaway(doc, prizes);
  } catch (err) {
    throw toServiceError(err);
  }
}

/* -------------------------------------------------------------------------- */
/* Stats                                                                       */
/* -------------------------------------------------------------------------- */

export async function getProgrammeStats() {
  if (isMockEnabled()) {
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
  try {
    const { items, meta } = await giveawaysApi.list({ limit: 100 });
    const active = items.filter((g) => g.status === 'ACTIVE');
    const sum = (fn) => items.reduce((s, g) => s + (fn(g) || 0), 0);
    return {
      isDemo: false,
      activeCount: active.length,
      totalGiveaways: meta?.total ?? items.length,
      totalParticipants: sum((g) => g.stats?.participationCount),
      prizesAwarded: sum((g) => g.stats?.winnerCount),
      nextEndsAt: active.length
        ? Math.min(...active.map((g) => new Date(g.endAt).getTime()))
        : null,
    };
  } catch (err) {
    throw toServiceError(err);
  }
}

/* -------------------------------------------------------------------------- */
/* Winners                                                                     */
/* -------------------------------------------------------------------------- */

function publishedWinnersForEndedGiveaways() {
  const byId = new Map(GIVEAWAYS.map((g) => [g.id, g]));
  const now = Date.now();
  return WINNERS.filter((w) => {
    const g = byId.get(w.giveawayId);
    return !g || statusOf(g, now) === 'ended';
  }).map(maskWinnerRecord);
}

export async function getRecentWinners() {
  if (isMockEnabled()) {
    const all = publishedWinnersForEndedGiveaways();
    return respond([...all].sort((a, b) => b.announcedAt - a.announcedAt).slice(0, 4));
  }
  const all = await collectAnnouncedWinners(4);
  return all.slice(0, 4);
}

export async function getPreviousWinners() {
  if (isMockEnabled()) {
    const all = publishedWinnersForEndedGiveaways();
    return respond([...all].sort((a, b) => b.announcedAt - a.announcedAt));
  }
  return collectAnnouncedWinners(6);
}

/**
 * The API has no single "all winners" endpoint, so the wall is assembled from
 * finished draws + their announced winners. Draws whose results are not yet
 * published contribute nothing (never a premature or fake announcement).
 * Awaiting a dedicated winners-list endpoint for a single-call version.
 */
async function collectAnnouncedWinners(limit) {
  try {
    const { items } = await giveawaysApi.previous({ limit });
    const perDraw = await Promise.all(
      items.map(async (g) => {
        const res = await winnersApi.forGiveaway(g.id, { limit: 4 }).catch(() => null);
        return (res?.items || []).map((w) => normalizeWinnerRow(w, res.giveaway || g));
      }),
    );
    return perDraw
      .flat()
      .sort((a, b) => (b.announcedAt ?? 0) - (a.announcedAt ?? 0));
  } catch (err) {
    throw toServiceError(err);
  }
}

/** Winners of ONE giveaway — only when the server has announced them. */
export async function getWinnersForGiveaway(giveawayId) {
  if (isMockEnabled()) {
    const g = GIVEAWAYS.find((x) => x.id === giveawayId);
    const now = Date.now();
    if (g && statusOf(g, now) !== 'ended') return respond([]);
    return respond(
      publishedWinnersForEndedGiveaways().filter((w) => w.giveawayId === giveawayId),
    );
  }
  try {
    const res = await winnersApi.forGiveaway(giveawayId, { limit: 50 });
    return res.items.map((w) => normalizeWinnerRow(w, res.giveaway));
  } catch (err) {
    throw toServiceError(err);
  }
}

/* -------------------------------------------------------------------------- */
/* Programme content — static copy (not an API surface)                        */
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
/* Participation (entry)                                                       */
/* -------------------------------------------------------------------------- */

export async function getEntryState(giveawayId) {
  if (isMockEnabled()) return mockEntryState(giveawayId);
  return apiEntryState(giveawayId);
}

async function mockEntryState(giveawayId) {
  const g = GIVEAWAYS.find((x) => x.id === giveawayId);
  if (!g) throw new ServiceError('NOT_FOUND', 'Unknown giveaway');
  const now = Date.now();
  const status = statusOf(g, now);
  if (!_store.isLoggedIn()) {
    return respond({ authenticated: false, status, entry: g.entry, hasJoined: false, eligible: true, balance: null });
  }
  const balance = _store.getBalance(g.entry.currency);
  const hasJoined = _store.hasJoined(g.id);
  const eligible = _store.isEligible();
  const fee = g.entry.amount;
  return respond({
    authenticated: true,
    status,
    entry: g.entry,
    fee,
    balance,
    eligible,
    hasJoined,
    sufficient: balance >= fee,
    projectedAfter: balance - fee,
  });
}

async function apiEntryState(giveawayId) {
  let giveaway;
  let prizes = [];
  try {
    giveaway = await giveawaysApi.getById(giveawayId);
    prizes = await giveawaysApi.prizes(giveawayId);
  } catch (err) {
    throw toServiceError(err);
  }
  const prize = primaryPrize(prizes);
  const authenticated = isAuthenticatedSync();

  if (!authenticated) {
    return entryStateFromApi({ giveaway, prize, authenticated: false });
  }

  // Parallel authoritative reads; a wallet failure yields an unknown balance,
  // never a fabricated one. my-status tells us whether this account already joined.
  const [myStatus, walletPayload] = await Promise.all([
    participationApi.myStatus(giveawayId).catch((err) => {
      if (err instanceof ApiClientError && err.status === 401) return null;
      return null;
    }),
    walletApi
      .balances(prize ? [prize.entryCurrency] : undefined)
      .catch(() => ({ items: [] })),
  ]);

  return entryStateFromApi({ giveaway, prize, myStatus, walletPayload, authenticated: true });
}

/**
 * Join a giveaway. The caller passes ONLY the giveaway id — never a fee or a
 * balance. The fee/tier are resolved from the server's prize config, then
 * POST /giveaways/:id/join runs the authoritative checks (auth, lifecycle,
 * eligibility, quota, balance, idempotency). Any failure throws a ServiceError;
 * success returns the server's receipt + authoritative balance.
 */
export async function joinGiveaway(giveawayId) {
  if (isMockEnabled()) return mockJoin(giveawayId);
  return apiJoin(giveawayId);
}

async function mockJoin(giveawayId) {
  const g = GIVEAWAYS.find((x) => x.id === giveawayId);
  if (!g) throw new ServiceError('NOT_FOUND', 'Unknown giveaway');
  const now = Date.now();
  const status = statusOf(g, now);
  if (!_store.isLoggedIn()) throw new ServiceError('NOT_AUTHENTICATED', 'Please sign in to enter this giveaway.');
  if (status === 'upcoming') throw new ServiceError('UPCOMING', 'Entries for this giveaway have not opened yet.');
  if (status === 'ended') throw new ServiceError('ENDED', 'The entry window for this giveaway has closed.');
  if (!_store.isEligible()) throw new ServiceError('INELIGIBLE', 'This account is not eligible to enter this giveaway.');
  if (_store.hasJoined(giveawayId)) throw new ServiceError('ALREADY_JOINED', 'You have already entered this giveaway.');
  const { currency } = g.entry;
  const fee = g.entry.amount;
  const balanceBefore = _store.getBalance(currency);
  if (balanceBefore < fee) {
    throw new ServiceError('INSUFFICIENT_BALANCE', `You need ${fee} ${currency} to enter but your balance is ${balanceBefore}.`);
  }
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

async function apiJoin(giveawayId) {
  let prizes = [];
  try {
    prizes = await giveawaysApi.prizes(giveawayId);
  } catch (err) {
    throw toServiceError(err);
  }
  const prize = primaryPrize(prizes);
  try {
    const result = await participationApi.join(giveawayId, {
      prizeId: prize?.id,
      currency: prize?.entryCurrency,
    });
    return joinReceiptFromApi(result, { id: giveawayId });
  } catch (err) {
    throw toServiceError(err);
  }
}
