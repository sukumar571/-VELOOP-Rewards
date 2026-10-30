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

/** Base URL of the versioned REST API. Empty string → same-origin (proxy). */
export const API_BASE_URL = normalizeBaseUrl(
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
  return API_BASE_URL === '';
}

let mockEnabled = defaultMockEnabled();

/** Whether reads should come from the fictional development mocks. */
export function isMockEnabled() {
  // A production build is authoritative: mocks are never silently shown.
  return IS_PRODUCTION ? false : mockEnabled;
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
