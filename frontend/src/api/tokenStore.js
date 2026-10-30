/**
 * ============================================================================
 * TOKEN STORE — a credential holder, never an authority.
 * ============================================================================
 * The backend is Bearer-only (no login/token-issuing or cookie endpoint exists
 * yet), so the approved approach is a client-held access-token CREDENTIAL that
 * is verified against GET /auth/me before anything is trusted. This module:
 *   - keeps the token in memory and (optionally) sessionStorage so a refresh
 *     during a dev session keeps the caller signed in,
 *   - NEVER treats localStorage/sessionStorage as authoritative for identity,
 *     balance, participation or winner status — those are always re-read from
 *     the API,
 *   - exposes a subscribe/notify channel so the client can broadcast an expired
 *     session (401) to the app without ever exposing the token itself.
 *
 * No JWT signing secret is, or ever can be, stored here.
 * ========================================================================= */

const STORAGE_KEY = 'veloop.auth.credential.v1';

let memoryToken = null;
const listeners = new Set();

function readStored() {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // storage disabled (private mode) — in-memory still works
  }
}

function writeStored(token) {
  try {
    if (token) window.sessionStorage.setItem(STORAGE_KEY, token);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore — credential stays in memory for this session */
  }
}

// Hydrate once from a previous session (still only a credential to be verified).
memoryToken = readStored();

/** Current access token (or null). Callers must still verify via /auth/me. */
export function getToken() {
  return memoryToken;
}

export function hasToken() {
  return Boolean(memoryToken);
}

/** Persist a newly issued credential (in memory + sessionStorage). */
export function setToken(token) {
  memoryToken = token || null;
  writeStored(memoryToken);
  notify();
  return memoryToken;
}

/** Drop the credential and tell subscribers the session ended. */
export function clearToken() {
  const had = memoryToken;
  memoryToken = null;
  writeStored(null);
  if (had) notify('expired');
  return had;
}

/** Subscribe to credential changes; returns an unsubscribe function. */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(reason = 'changed') {
  for (const l of [...listeners]) {
    try {
      l({ reason, hasToken: Boolean(memoryToken) });
    } catch {
      /* a listener must never break the auth lifecycle */
    }
  }
}
