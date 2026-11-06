/**
 * ============================================================================
 * SESSION / WALLET SERVICE — authentication + authoritative wallet surface.
 * ============================================================================
 * Two data sources behind ONE stable surface (getSession / signup / login /
 * logout / getWallet / getMembership / _store):
 *   • Development mocks (isMockEnabled()) — an explicitly-fictional store so
 *     the participation flow can be exercised with no backend and no network.
 *     Registration + sign-in stay in browser localStorage in this mode
 *     (see services/demoAuth.js).
 *   • The real Express API — `/auth/signup`, `/auth/login`, `/auth/me` and
 *     `/wallet/balances`. Signup/login write to the users collection in the
 *     MongoDB configured by backend/.env (Atlas in this deployment) and
 *     return a bearer credential that tokenStore.js holds.
 * Identity, eligibility and balance are ALWAYS re-read from the server after
 * the credential is installed; the client-held token is only a credential, never
 * the authority.
 * ========================================================================= */
import { isMockEnabled } from '../config/env.js';
import * as authApi from '../api/authApi.js';
import * as walletApi from '../api/walletApi.js';
import { balancesMap } from '../api/normalize.js';
import { ApiClientError } from '../api/client.js';
import { getToken, setToken, clearToken, hasToken } from '../api/tokenStore.js';
import { ServiceError } from '../api/errors.js';
import { registerAccount, verifyAccount } from './demoAuth.js';

/* -------------------------------------------------------------------------- */
/* DEMO MOCK STORE (development only)                                          */
/* -------------------------------------------------------------------------- */

const DEMO_WALLET = { VE: 300, SVE: 120, TOKEN: 1500 };
const DEMO_MEMBER = { id: 'usr-demo-001', name: 'Demo Member' };
const STORAGE_KEY = 'veloop.demo.session.v1';

export const IS_DEMO_SESSION = true;

function freshState() {
  return { user: null, balances: { ...DEMO_WALLET }, joined: [], redeemed: [], eligible: true };
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
  credit: (currency, amount) => {
    state.balances[currency] = (state.balances[currency] ?? 0) + amount;
    persist();
  },
  addJoin: (giveawayId) => {
    if (!state.joined.includes(giveawayId)) state.joined.push(giveawayId);
    persist();
  },
  hasRedeemed: (code) => state.redeemed.includes(code),
  addRedeem: (code) => {
    if (!state.redeemed.includes(code)) state.redeemed.push(code);
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

export async function login(profile) {
  if (isMockEnabled()) {
    // A demo profile (from the local sign-in/registration form) personalises the
    // session; with none we fall back to the generic demo member. Either way this
    // is a client-side demo session only — never a real authenticated principal.
    const user =
      profile && profile.email
        ? { id: profile.id || DEMO_MEMBER.id, name: profile.name || 'Member', email: profile.email }
        : { ...DEMO_MEMBER };
    state = { ...freshState(), user, eligible: state.eligible };
    persist();
    return settle({ user: state.user });
  }
  // Real mode: the caller is expected to have already installed a bearer
  // credential via signup()/signIn(). We DO NOT trust the `profile` argument —
  // identity comes from /auth/me, which the server verifies from the token.
  const s = await getSession();
  if (!s.user) {
    throw new ServiceError(
      'LOGIN_REQUIRED',
      'A verified session could not be established. Please sign in again.',
    );
  }
  return s;
}

/**
 * Real-mode email+password registration. Creates the account in the MongoDB
 * configured by backend/.env (the Atlas `users` collection), installs the
 * returned bearer credential, then hydrates the session via /auth/me so the
 * caller never has to trust the response body for identity.
 *
 * Mock-mode fallthrough: kept here so LoginPage has ONE entry point and the
 * existing demo tests (which rely on localStorage) continue to pass without
 * any page-level branching.
 */
export async function signup({ name, email, password } = {}) {
  if (isMockEnabled()) {
    const res = registerAccount({ name, email, password });
    if (!res.ok) throw new ServiceError(res.field === 'email' ? 'EMAIL_TAKEN' : 'VALIDATION_ERROR', res.message, { field: res.field });
    // Also start the demo session so callers can chain signup → login if they
    // want the old behaviour; if they set the token themselves, nothing breaks.
    state = { ...freshState(), user: { id: res.account.id, name: res.account.name, email: res.account.email }, eligible: state.eligible };
    persist();
    return settle({ user: state.user });
  }
  const { user, token } = await authApi.signup({ name, email, password });
  setToken(token);
  return { user, token };
}

/**
 * Real-mode email+password sign-in. Verifies the pair server-side, installs the
 * bearer, hydrates via /auth/me. The API's error for a bad pair is a single
 * INVALID_CREDENTIALS (401) regardless of which half was wrong.
 */
export async function signIn({ email, password } = {}) {
  if (isMockEnabled()) {
    const res = verifyAccount({ email, password });
    if (!res.ok) throw new ServiceError('INVALID_CREDENTIALS', res.message);
    state = { ...freshState(), user: { id: res.account.id, name: res.account.name, email: res.account.email }, eligible: state.eligible };
    persist();
    return settle({ user: state.user });
  }
  const { user, token } = await authApi.login({ email, password });
  setToken(token);
  return { user, token };
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
