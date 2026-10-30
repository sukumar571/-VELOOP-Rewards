/**
 * ============================================================================
 * SESSION / WALLET SERVICE — authentication + authoritative wallet surface.
 * ============================================================================
 * Two data sources behind ONE stable surface (getSession / login / logout /
 * getWallet / getMembership / _store):
 *   • Development mocks (isMockEnabled()) — an explicitly-fictional store so
 *     the participation flow can be exercised with no backend and no network.
 *   • The real Express API — /auth/me (verified principal) and
 *     /wallet/balances (read-only, authoritative). The stored token is only a
 *     CREDENTIAL: identity, eligibility and balance are always re-read from the
 *     server, never trusted from localStorage/sessionStorage.
 * There is no in-app sign-in against the API: real authentication is issued by
 * the VELOOP identity system (external), so login() is a dev-mock affordance.
 * ========================================================================= */
import { isMockEnabled } from '../config/env.js';
import * as authApi from '../api/authApi.js';
import * as walletApi from '../api/walletApi.js';
import { balancesMap } from '../api/normalize.js';
import { ApiClientError } from '../api/client.js';
import { getToken, setToken, clearToken, hasToken } from '../api/tokenStore.js';
import { ServiceError } from '../api/errors.js';

/* -------------------------------------------------------------------------- */
/* DEMO MOCK STORE (development only)                                          */
/* -------------------------------------------------------------------------- */

const DEMO_WALLET = { VE: 300, SVE: 120, TOKEN: 1500 };
const DEMO_MEMBER = { id: 'usr-demo-001', name: 'Demo Member' };
const STORAGE_KEY = 'veloop.demo.session.v1';

export const IS_DEMO_SESSION = true;

function freshState() {
  return { user: null, balances: { ...DEMO_WALLET }, joined: [], eligible: true };
}

function read() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? { ...freshState(), ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

function persist() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable (private mode) — demo still works in-memory */
  }
}

let state = read() ?? freshState();

/** Sync internals for the MOCK participation path (never used by React state). */
export const _store = {
  isLoggedIn: () => !!state.user,
  getUserId: () => state.user?.id ?? null,
  getBalance: (currency) => state.balances[currency] ?? 0,
  hasJoined: (giveawayId) => state.joined.includes(giveawayId),
  isEligible: () => state.eligible,
  deduct: (currency, amount) => {
    state.balances[currency] = (state.balances[currency] ?? 0) - amount;
    persist();
  },
  addJoin: (giveawayId) => {
    if (!state.joined.includes(giveawayId)) state.joined.push(giveawayId);
    persist();
  },
};

function settle(data, ms = 250) {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(data)), ms));
}

/* -------------------------------------------------------------------------- */
/* Public surface — routes to the mock store or the real API                    */
/* -------------------------------------------------------------------------- */

/**
 * Synchronous "is a session present?" hint for callers that must not await
 * (participation reads). Backed by the demo store OR the presence of a bearer
 * credential — the credential is only a hint; the server decides everything.
 */
export function isAuthenticatedSync() {
  return isMockEnabled() ? _store.isLoggedIn() : hasToken();
}

export async function getSession() {
  if (isMockEnabled()) return settle({ user: state.user });
  try {
    const principal = await authApi.me();
    return {
      user: principal
        ? {
            id: principal.id,
            name: principal.name || principal.email || 'Member',
            email: principal.email || null,
            roles: principal.roles || [],
          }
        : null,
    };
  } catch (err) {
    // 401 has already cleared the credential in the client; treat as signed out.
    if (err instanceof ApiClientError && err.status === 401) return { user: null };
    throw err;
  }
}

export async function login() {
  if (isMockEnabled()) {
    state = { ...freshState(), user: { ...DEMO_MEMBER }, eligible: state.eligible };
    persist();
    return settle({ user: state.user });
  }
  // The API issues no token in-app; authentication is handled by VELOOP (external).
  throw new ServiceError(
    'AUTH_EXTERNAL',
    'Sign-in is handled by the VELOOP identity system; this build has no in-app login endpoint.',
  );
}

/**
 * Development affordance: install a bearer credential issued out-of-band (e.g.
 * `npm run token:dev` on the backend). The token is a CREDENTIAL only — it is
 * immediately verified by getSession()/the API, never trusted on its own.
 */
export function setCredential(token) {
  if (isMockEnabled()) return false;
  setToken(token);
  return true;
}

export async function logout() {
  if (isMockEnabled()) {
    state = { ...freshState(), eligible: state.eligible };
    persist();
    return settle({ user: null });
  }
  clearToken();
  return { user: null };
}

/**
 * The authoritative wallet. NEVER fabricates a balance: a wallet the backend
 * cannot report (WALLET_NOT_CONFIGURED / network error) resolves to an empty
 * map + an `unavailable` marker so the UI shows "—" instead of a fake number.
 */
export async function getWallet() {
  if (isMockEnabled()) {
    if (!state.user) return settle(null);
    return settle({ balances: { ...state.balances } });
  }
  if (!getToken()) return null; // signed out — no wallet to show
  try {
    const payload = await walletApi.balances();
    return {
      balances: balancesMap(payload),
      integration: payload?.integration || null,
      authoritative: true,
    };
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 401) return null;
    // Honest degradation: no balances, but a clear "unavailable" reason.
    return { balances: {}, unavailable: true, unavailableReason: err.code || 'WALLET_UNAVAILABLE' };
  }
}

export async function getMembership() {
  if (isMockEnabled()) return settle({ joined: [...state.joined], eligible: state.eligible });
  // No dedicated membership surface; participation truth comes from my-status.
  return { joined: [], eligible: true };
}

/** DEMO-ONLY control to exercise the ineligible participation state. */
export function setEligibleForDemo(eligible) {
  if (isMockEnabled()) {
    state.eligible = !!eligible;
    persist();
    return settle({ eligible: state.eligible });
  }
  // Eligibility is decided server-side; there is no client override.
  return Promise.resolve({ eligible: true, readOnly: true });
}
