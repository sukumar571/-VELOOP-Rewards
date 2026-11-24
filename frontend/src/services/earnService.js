/**
 * ============================================================================
 * EARN SERVICE — "redeem a code → update the balance".
 * ============================================================================
 * Three data sources, in this order of preference:
 *   1. the development mocks (isMockEnabled()) — an explicitly-fictional store so
 *      the loop can be exercised with no backend and no network;
 *   2. the real API — POST /wallet/redeem, where the SERVER decides the amount
 *      and refuses when it has no wallet it is allowed to credit;
 *   3. when the API says exactly that (REDEEM_UNAVAILABLE / WALLET_NOT_CONFIGURED),
 *      the per-account ledger in this browser (services/earnLedger.js), so a code
 *      still updates the balance the member sees on this deployment.
 * A plain network failure is never turned into a credit: the member is told to
 * try again, because the server may already have applied it.
 * ========================================================================= */
import { isMockEnabled } from '../config/env.js';
import { PROMO_CODES, normalizeCode, findPromoCode } from '../config/promoCodes.js';
import * as walletApi from '../api/walletApi.js';
import { ApiClientError } from '../api/client.js';
import { tokenSubject } from '../api/tokenStore.js';
import { _store } from './sessionService.js';
import { hasRedeemed, credit } from './earnLedger.js';

/** Errors that mean "this deployment has no wallet to post to" → ledger. */
const NO_WALLET_CODES = new Set(['REDEEM_UNAVAILABLE', 'WALLET_NOT_CONFIGURED']);

/** The storage namespace for the signed-in account (never an authority). */
function accountKey() {
  return isMockEnabled() ? _store.getUserId() : tokenSubject();
}

/** Marks the codes the signed-in account has already used. */
function tagRedeemed(used) {
  return PROMO_CODES.map((c) => ({ ...c, redeemed: used(c.code) }));
}

/**
 * The catalogue for the earning page. Always resolves to a usable list: the
 * server's own catalogue + redemption state when it can credit, otherwise the
 * local mirror with this account's ledger state.
 */
export async function fetchCodes() {
  if (isMockEnabled()) {
    return { redemptionAvailable: true, codes: tagRedeemed((code) => _store.hasRedeemed(code)) };
  }

  try {
    const payload = await walletApi.codes();
    if (payload?.redemptionAvailable !== false) {
      return {
        redemptionAvailable: true,
        codes: Array.isArray(payload?.codes) ? payload.codes : [],
      };
    }
  } catch (err) {
    // Signed out / expired credential: nothing to list is wrong with the code
    // list, so fall through to the local catalogue and let Redeem explain.
    if (err instanceof ApiClientError && err.status === 401) {
      return { redemptionAvailable: true, codes: tagRedeemed(() => false) };
    }
  }

  const key = accountKey();
  return {
    redemptionAvailable: true,
    local: true,
    codes: tagRedeemed((code) => (key ? hasRedeemed(key, code) : false)),
  };
}

/**
 * Redeems one code. Resolves to { ok:true, code, currency, amount, balance } or
 * { ok:false, message }; the credit amount always comes from the catalogue.
 */
export async function redeemCode(rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, message: 'Enter a code to redeem.' };

  const promo = findPromoCode(code);
  if (!promo) {
    return { ok: false, message: 'That code isn’t valid. Pick one from the list below.' };
  }

  // ---- Development mocks: the fictional in-browser store -------------------
  if (isMockEnabled()) {
    if (!_store.isLoggedIn()) {
      return { ok: false, message: 'Please sign in to redeem a code.' };
    }
    if (_store.hasRedeemed(promo.code)) {
      return { ok: false, message: 'This code has already been redeemed on this account.' };
    }
    _store.credit(promo.currency, promo.amount);
    _store.addRedeem(promo.code);
    return {
      ok: true,
      code: promo.code,
      currency: promo.currency,
      amount: promo.amount,
      balance: _store.getBalance(promo.currency),
    };
  }

  // ---- Real API -----------------------------------------------------------
  const key = accountKey();
  if (!key) return { ok: false, message: 'Please sign in to redeem a code.' };
  if (hasRedeemed(key, promo.code)) {
    return { ok: false, message: 'This code has already been redeemed on this account.' };
  }

  try {
    const payload = await walletApi.redeem(promo.code);
    return {
      ok: true,
      code: payload?.code ?? promo.code,
      currency: payload?.currency ?? promo.currency,
      amount: payload?.amount ?? promo.amount,
      balance: typeof payload?.balance === 'number' ? payload.balance : null,
      source: 'server',
    };
  } catch (err) {
    const errCode = err instanceof ApiClientError ? err.code : null;

    if (errCode === 'REDEEM_CODE_ALREADY_REDEEMED') {
      return { ok: false, message: 'This code has already been redeemed on this account.' };
    }
    if (!NO_WALLET_CODES.has(errCode)) {
      return {
        ok: false,
        message:
          err instanceof ApiClientError
            ? err.message
            : 'We could not redeem that code right now. Please try again.',
      };
    }
  }

  // ---- The deployment has no wallet to post to: keep the credit locally ----
  const res = credit(key, promo.code, promo.currency, promo.amount);
  if (!res.ok) {
    return { ok: false, message: 'This code has already been redeemed on this account.' };
  }
  return {
    ok: true,
    code: promo.code,
    currency: promo.currency,
    amount: promo.amount,
    balance: res.balance,
    source: 'local',
  };
}
