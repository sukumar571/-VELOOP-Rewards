/**
 * ============================================================================
 * SESSION / WALLET STORE — development stand-in for the authenticated backend.
 * ============================================================================
 * There is no real backend yet, so authentication, balances and the entry
 * ledger live here as an explicitly-fictional demo store (persisted to
 * sessionStorage so a refresh keeps the member signed in during testing).
 *
 * It is the SINGLE authority the participation API reads from. The UI never
 * mutates balances itself and never sends a fee/balance it expects to be
 * trusted — joinGiveaway() in giveawayService re-reads everything from here and
 * from the giveaway config. At integration this module is replaced by
 * authenticated /api/v1 calls; only giveawayService's bodies change.
 * ========================================================================= */

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

/* -------------------------------------------------------------------------- */
/* Sync internals (used by the participation API — never by React state)       */
/* -------------------------------------------------------------------------- */

export const _store = {
  isLoggedIn: () => !!state.user,
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

/* -------------------------------------------------------------------------- */
/* Public async surface (simulated latency so loading states are exercised)     */
/* -------------------------------------------------------------------------- */

function settle(data, ms = 250) {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(data)), ms));
}

export function getSession() {
  return settle({ user: state.user });
}

export function login() {
  // Fresh deterministic wallet every sign-in so fee/balance tests repeat.
  state = { ...freshState(), user: { ...DEMO_MEMBER }, eligible: state.eligible };
  persist();
  return settle({ user: state.user });
}

export function logout() {
  state = { ...freshState(), eligible: state.eligible };
  persist();
  return settle({ user: null });
}

export function getWallet() {
  if (!state.user) return settle(null);
  return settle({ balances: { ...state.balances } });
}

export function getMembership() {
  return settle({ joined: [...state.joined], eligible: state.eligible });
}

/**
 * DEMO-ONLY control so the ineligible participation state can be exercised in
 * the browser without a backend. Real eligibility is decided server-side and is
 * [PDF]/backend-pending; nothing here invents that policy.
 */
export function setEligibleForDemo(eligible) {
  state.eligible = !!eligible;
  persist();
  return settle({ eligible: state.eligible });
}
