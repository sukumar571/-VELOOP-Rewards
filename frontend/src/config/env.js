/**
 * ============================================================================
 * RUNTIME ENVIRONMENT — the single place the frontend reads configuration.
 * ============================================================================
 * VITE_API_BASE_URL points the centralized client at the Express API
 * (`/api/v1`). It is a PUBLIC build-time value (Vite inlines any `VITE_`
 * variable), so it must never contain a secret. The JWT SIGNING SECRET lives
 * only on the server; the browser ever holds is an access-token CREDENTIAL.
 *
 * `isMockEnabled()` gates the explicitly-fictional development mocks. It is
 * mutable so tests can toggle the data source deterministically, but it is
 * FORCED OFF whenever `VITE_USE_MOCK_DATA` is 'false'/'0' or in a production
 * build — so a real API failure can never be papered over with fake data.
 * ========================================================================= */

/**
 * Base URL of the versioned REST API. Empty string → same-origin.
 * An explicitly configured VITE_API_BASE_URL always wins. When nothing is set,
 * a PRODUCTION build (the Vercel `frontend` service) defaults to the same-origin
 * `/api/v1` mount so the SPA reaches the `backend` service through the top-level
 * rewrite with no cross-origin call and no injected secret — a static bundle
 * cannot read a runtime service binding, so same-origin routing is the contract.
 * A dev server keeps '' and relies on the Vite `/api` proxy instead.
 */
const configuredApiBase = normalizeBaseUrl(
  import.meta.env.VITE_API_BASE_URL ?? '',
);

function normalizeBaseUrl(raw) {
  const trimmed = String(raw).trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  // Accept either a bare origin (scheme+host[+port]) or an explicit prefix;
  // when only an origin is given we default to the documented /api/v1 mount.
  return /\/api(\/|$)/.test(trimmed) ? trimmed : `${trimmed}/api/v1`;
}

/** True for a Vite production build (`vite build`). */
export const IS_PRODUCTION = import.meta.env.PROD === true;

/**
 * Development-mock switch. Default is ON only when there is NO API configured
 * AND this is not a production build; `VITE_USE_MOCK_DATA` can force it either
 * way for local testing. Production builds can never enable it.
 */
function defaultMockEnabled() {
  if (IS_PRODUCTION) return false;
  const flag = String(import.meta.env.VITE_USE_MOCK_DATA ?? '').trim().toLowerCase();
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;
  // No configured API and not production → fall back to the demo store.
  return configuredApiBase === '';
}

let mockEnabled = defaultMockEnabled();

/**
 * DEMO MODE — an EXPLICIT, visitor-initiated switch onto the fictional demo
 * dataset (demo giveaways, demo accounts, demo wallet with VEs/SVEs/Tokens).
 *
 * Why it exists: the shipped deployment runs with the wallet integration
 * configured as `disabled`, so it can honestly show neither a balance nor a
 * credit. Demo mode lets anyone try the earning + participation loop end to end
 * with balances the browser owns — never a number presented as real VELOOP
 * funds. It is only entered deliberately (`?demo=1` or the visible button), it
 * is scoped to the browser tab (sessionStorage), and the UI states what it is.
 */
const DEMO_STORAGE_KEY = 'veloop.demoMode.v1';

/** Reads the opt-in: an explicit `?demo=1` / `?demo=0` wins, else the tab flag. */
function readDemoOptIn() {
  try {
    if (typeof window === 'undefined') return false;
    const flag = String(new URLSearchParams(window.location.search).get('demo') ?? '')
      .trim()
      .toLowerCase();
    if (flag === '1' || flag === 'true' || flag === 'on') {
      window.sessionStorage.setItem(DEMO_STORAGE_KEY, '1');
      return true;
    }
    if (flag === '0' || flag === 'false' || flag === 'off') {
      window.sessionStorage.removeItem(DEMO_STORAGE_KEY);
      return false;
    }
    return window.sessionStorage.getItem(DEMO_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let demoOptIn = readDemoOptIn();

/** True while the visitor has explicitly opted into the fictional demo. */
export function isDemoMode() {
  return demoOptIn;
}

/** Persists the demo opt-in (no reload). Components use enterDemoMode(). */
export function setDemoMode(next) {
  demoOptIn = !!next;
  try {
    if (demoOptIn) window.sessionStorage.setItem(DEMO_STORAGE_KEY, '1');
    else window.sessionStorage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    /* storage unavailable — the mode still applies to this page load */
  }
  return demoOptIn;
}

/** Reloads on the same URL with the `demo` query parameter stripped. */
function reloadWithoutDemoParam() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('demo');
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

/** Opt in to the fictional demo dataset and reload onto it. */
export function enterDemoMode() {
  setDemoMode(true);
  reloadWithoutDemoParam();
}

/** Leave the demo dataset and return to the live deployment. */
export function exitDemoMode() {
  setDemoMode(false);
  reloadWithoutDemoParam();
}

/**
 * Base URL of the versioned REST API. An explicitly configured
 * VITE_API_BASE_URL always wins. Otherwise, whenever we talk to a REAL API
 * (mocks off) we default to the same-origin `/api/v1` mount so the browser
 * actually requests `/api/v1/...` — which the Vite dev proxy forwards to Express
 * and which a production deploy serves same-origin. In mock mode the value is
 * unused, so it stays empty (what the offline demo and the test suite load with).
 */
export const API_BASE_URL =
  configuredApiBase || (mockEnabled || demoOptIn ? '' : '/api/v1');

/** Whether reads should come from the fictional development mocks. */
export function isMockEnabled() {
  // A production build is authoritative: the live API is used unless the
  // visitor has EXPLICITLY opted into the demo dataset. Nothing falls back to
  // fake data silently.
  return IS_PRODUCTION ? demoOptIn : mockEnabled || demoOptIn;
}

/**
 * Test / development-only override. Ignored in a production build so no test
 * harness or stray call site can flip a deployed app back onto fake data.
 */
export function setMockEnabled(next) {
  if (IS_PRODUCTION) return mockEnabled;
  mockEnabled = !!next;
  return mockEnabled;
}

/** Are we wired to a real API at all? (mocks off but no base URL = misconfig) */
export function hasApiConfigured() {
  return API_BASE_URL !== '';
}
