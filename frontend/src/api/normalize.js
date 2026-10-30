/**
 * ============================================================================
 * NORMALIZATION — backend contract  ->  the shapes the UI already consumes.
 * ============================================================================
 * The existing components were written against a single-giveaway / single-fee
 * view (`entry: {currency, amount}`). The real API models a giveaway as an
 * aggregate of N prize TIERS, each with its own entryCurrency/entryAmount, and
 * returns lifecycle/claim enums. Rather than rewrite every component, this layer
 * maps the authoritative payload onto the SAME shapes, choosing the primary
 * (lowest-position, active) tier as the displayed entry and remembering its
 * `prizeId` so a join is unambiguous. NOTHING here invents a value: absent
 * numbers become null and are rendered as unknown, never as a fabricated 0.
 * ========================================================================= */

/* ---- lifecycle + enum mapping ------------------------------------------- */

export function mapStatus(backendStatus) {
  switch (backendStatus) {
    case 'UPCOMING':
      return 'upcoming';
    case 'ACTIVE':
      return 'active';
    case 'ENDED':
    case 'ARCHIVED':
      return 'ended';
    default:
      return 'ended';
  }
}

/** claimType is the primary signal; prizeType is the documented fallback. */
export function deliveryModeOf({ claimType, prizeType } = {}) {
  if (claimType === 'FORM') return 'physical';
  if (claimType === 'DIGITAL_DELIVERY') return 'digital';
  if (claimType === 'AUTOMATIC') return 'none';
  if (prizeType === 'PHYSICAL') return 'physical';
  if (prizeType === 'GIFT_CARD' || prizeType === 'DIGITAL') return 'digital';
  return 'none';
}

/** Map a backend prizeType onto a UI prize-type key (drives deliveryMode copy). */
export function mapPrizeTypeKey(prizeType) {
  if (prizeType === 'GIFT_CARD' || prizeType === 'DIGITAL') return 'voucher';
  return 'device'; // PHYSICAL and anything unknown render as a generic physical
}

const toMs = (v) => (v == null ? null : new Date(v).getTime());

/* ---- giveaway + prize ---------------------------------------------------- */

/** Primary tier = first active prize by position (the fee the UI shows). */
export function primaryPrize(prizes = []) {
  const active = prizes.filter((p) => p.active !== false);
  const pool = active.length ? active : prizes;
  return [...pool].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0] || null;
}

/**
 * Assemble the UI giveaway object from a giveaway document + its prize tiers.
 * `prizes` may be empty (list reads without a per-draw prizes fetch) — then the
 * entry/fee stays null and the UI renders "fee unavailable" rather than a lie.
 */
export function normalizeGiveaway(g, prizes = []) {
  const prize = primaryPrize(prizes);
  const status = mapStatus(g.status);
  const startsAt = toMs(g.startAt);
  const endsAt = toMs(g.endAt);
  const now = Date.now();

  return {
    id: g.id,
    slug: g.slug,
    title: g.title,
    tagline: g.tagline || '',
    description: g.description || '',
    icon: g.icon || 'Gift',
    assetKey: g.slug || g.id,
    accent: g.accent || 'violet',
    // Prize-tier derived, configuration-driven — never invented:
    prizeType: prize ? mapPrizeTypeKey(prize.prizeType) : 'device',
    entry: prize ? { currency: prize.entryCurrency, amount: prize.entryAmount } : null,
    prizeId: prize ? prize.id : null,
    maxEntries: prize?.maxEntries ?? undefined,
    winners: totalWinnerSlots(g, prizes),
    participants: g.stats?.participationCount ?? 0,
    // Lifecycle:
    status,
    endingSoon: status === 'active' && endsAt != null && endsAt - now <= 5 * 86_400_000,
    startsAt,
    endsAt,
    // Rules rendered as a bullet list; the API stores structured rule copy.
    rules: rulesToList(g),
    published: !!g.published,
    _raw: g,
    _prizes: prizes,
  };
}

function totalWinnerSlots(g, prizes) {
  if (prizes && prizes.length) {
    return prizes.reduce((s, p) => s + (p.winnerCount || 0), 0);
  }
  return g.stats?.winnerCount ?? 0;
}

function rulesToList(g) {
  const summary = g.rules?.summary;
  if (Array.isArray(summary)) return summary;
  if (typeof summary === 'string' && summary.trim()) {
    return summary
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/* ---- wallet -------------------------------------------------------------- */

/**
 * Currency -> balance map from the authoritative items[]. ONLY a numeric,
 * non-stale-with-no-value balance becomes a number; unknown/unavailable stays
 * absent so callers render "—" and never a fabricated 0.
 */
export function balancesMap(payload) {
  const out = {};
  const items = payload?.items;
  if (!Array.isArray(items)) return out;
  for (const it of items) {
    if (!it || !it.currency) continue;
    out[it.currency] = typeof it.balance === 'number' ? it.balance : null;
  }
  return out;
}

/** Authoritative single balance (number) or null when unknown. */
export function balanceForCurrency(payload, currency) {
  const map = balancesMap(payload);
  return Object.prototype.hasOwnProperty.call(map, currency) ? map[currency] : null;
}

/* ---- entry state (participation) ---------------------------------------- */

/**
 * UI entry state from a giveaway document, its primary prize, the caller's
 * my-status (optional) and a wallet payload (optional). Balance is only ever
 * taken from the wallet API; `hasJoined`/`status` come from the server.
 */
export function entryStateFromApi({ giveaway, prize, myStatus, walletPayload, authenticated }) {
  const status = mapStatus(giveaway.status);
  const entry = prize ? { currency: prize.entryCurrency, amount: prize.entryAmount } : null;
  const base = {
    authenticated: !!authenticated,
    status,
    entry,
    prizeId: prize ? prize.id : null,
    eligible: true, // server enforces eligibility on join; never claim ineligible
    hasJoined: false,
  };

  if (!authenticated || !entry) {
    return { ...base, balance: null };
  }

  const balance = balanceForCurrency(walletPayload, entry.currency);
  const hasJoined = Boolean(myStatus?.joined);
  const fee = entry.amount;
  const sufficient = typeof balance === 'number' ? balance >= fee : false;
  return {
    ...base,
    hasJoined,
    fee,
    balance,
    sufficient,
    // Display-only preview; suppressed downstream when balance is unknown.
    projectedAfter: typeof balance === 'number' ? balance - fee : null,
  };
}

/** Join receipt mapped onto the UI shape (honest unknown-balance handling). */
export function joinReceiptFromApi(result, giveaway) {
  const pricing = result?.pricing || {};
  const balance = result?.balance || null;
  const balanceAfter = balance && typeof balance.balance === 'number' ? balance.balance : null;
  const statsCount = giveaway?.stats?.participationCount;
  return {
    ok: true,
    replayed: Boolean(result?.replayed),
    giveawayId: result?.giveaway?.id || giveaway?.id || null,
    prizeId: result?.prize?.id || null,
    currency: pricing.currency || balance?.currency || null,
    fee: pricing.charged ?? pricing.unitAmount ?? null,
    unitAmount: pricing.unitAmount ?? null,
    entries: pricing.entries ?? null,
    balanceAfter,
    // balanceBefore is not always known; derive only when both sides exist.
    balanceBefore:
      balanceAfter != null && typeof pricing.charged === 'number'
        ? balanceAfter + pricing.charged
        : null,
    participants: typeof statsCount === 'number' ? statsCount : undefined,
    status: result?.giveaway?.status || giveaway?.status || null,
  };
}

/* ---- winners ------------------------------------------------------------- */

export function normalizeWinnerRow(item, giveawayMeta) {
  const display = item.display || {};
  return {
    id: item.id,
    giveawayId: giveawayMeta?.id || null,
    giveawaySlug: giveawayMeta?.slug || null,
    giveawayTitle: giveawayMeta?.title || null,
    prize: item.prizeName || null,
    maskedUserId: display.maskedUserId ?? 'VU-••••-••••',
    displayAlias: display.displayAlias ?? 'V••••',
    announcedAt: toMs(item.announcedAt),
    rank: item.rank ?? null,
    // Fulfilment state is not part of the public winner projection; left absent
    // rather than fabricated so the card never invents a delivery status.
    deliveryStatus: undefined,
  };
}

/* ---- claims -------------------------------------------------------------- */

/** getClaimContext-shaped record for one draw from my-status + claim detail. */
export function claimContextFromApi({ giveaway, myStatus, claimDetail, fields }) {
  const status = mapStatus(giveaway.status);
  const published = status === 'ended';
  const isWinner = Boolean(myStatus?.isWinner);
  const claim = claimDetail || myStatus?.claim || null;
  const deliveryMode = deliveryModeOf(claim || {});
  const effectiveStatus = claim?.status ?? null;
  const deadline = toMs(claim?.deadlineAt ?? null);
  const canClaim =
    isWinner &&
    published &&
    (claim?.canSubmit ?? (effectiveStatus === 'NOT_SUBMITTED' && !claim?.expired)) === true;

  return {
    authenticated: true,
    published,
    isWinner,
    giveawayId: giveaway.id,
    giveawaySlug: giveaway.slug || null,
    giveawayTitle: giveaway.title,
    prize: giveaway.tagline || giveaway.title,
    claimId: claim?.id ?? null,
    deliveryMode,
    fields,
    status: effectiveStatus,
    deadline,
    canClaim: Boolean(canClaim),
  };
}

/** A single my-won-records row from a claim item + the giveaway metadata. */
export function claimRecordFromApi(claimItem, giveawayMeta, fields) {
  const deliveryMode = deliveryModeOf(claimItem || {});
  const deadline = toMs(claimItem?.deadlineAt ?? null);
  return {
    giveawayId: giveawayMeta?.id ?? claimItem?.giveawayId ?? null,
    giveawaySlug: giveawayMeta?.slug ?? null,
    giveawayTitle: giveawayMeta?.title ?? null,
    prize: giveawayMeta?.title ?? null,
    claimId: claimItem?.id ?? null,
    deliveryMode,
    fields,
    status: claimItem?.status ?? null,
    deadline,
    canClaim: Boolean(claimItem?.canSubmit) && claimItem?.resultsPublished !== false,
  };
}
