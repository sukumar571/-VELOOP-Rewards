/**
 * ============================================================================
 * DEMO AUTH DIRECTORY — a LOCAL, browser-only account store.
 * ============================================================================
 * This exists so the sign-in / registration journey can be demonstrated with
 * real form fields and a "register once, then log in with those details" flow
 * WITHOUT a backend. It is emphatically NOT authentication:
 *   - accounts live only in this browser's localStorage and never leave it;
 *   - the "hash" below is a non-cryptographic obfuscation so a password is not
 *     stored in plain text on disk — it is NOT a security control and must never
 *     be treated as one;
 *   - nothing here is trusted for identity, eligibility or money. The real
 *     VELOOP identity system is external (docs/PLAN.md — A1 auth); when it is
 *     wired up this module is deleted, not extended.
 * Kept deliberately small and synchronous so the login page and its tests can
 * rely on it without any network or crypto-subtle availability.
 * ========================================================================= */

const STORAGE_KEY = 'veloop.demo.accounts.v1';

/** Deterministic, non-cryptographic string digest (obfuscation only). */
function demoDigest(input) {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export function hashPassword(password) {
  return demoDigest(`veloop.demo.v1:${String(password)}`);
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function storageAvailable() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

function readAll() {
  if (!storageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(accounts) {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch {
    /* private mode / quota — the demo simply won't persist across reloads */
  }
}

/** Every registered demo account (never exposes the stored digest). */
export function listAccounts() {
  return readAll().map(({ id, name, email, createdAt }) => ({ id, name, email, createdAt }));
}

export function hasAnyAccount() {
  return readAll().length > 0;
}

export function emailExists(email) {
  const target = normalizeEmail(email);
  return readAll().some((a) => a.email === target);
}

/**
 * Create a demo account. Returns { ok, account } or { ok:false, field, message }
 * so the caller can surface a field-level error. Validation mirrors what a real
 * registration endpoint would enforce, but the outcome is local-only.
 */
export function registerAccount({ name, email, password } = {}) {
  const cleanName = String(name || '').trim();
  const cleanEmail = normalizeEmail(email);

  if (cleanName.length < 2) {
    return { ok: false, field: 'name', message: 'Please enter your full name.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { ok: false, field: 'email', message: 'Enter a valid email address.' };
  }
  if (String(password || '').length < 6) {
    return { ok: false, field: 'password', message: 'Password must be at least 6 characters.' };
  }
  if (emailExists(cleanEmail)) {
    return { ok: false, field: 'email', message: 'An account with this email already exists. Try signing in.' };
  }

  const account = {
    id: `usr-demo-${demoDigest(cleanEmail).slice(0, 8)}`,
    name: cleanName,
    email: cleanEmail,
    pw: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  const accounts = readAll();
  accounts.push(account);
  writeAll(accounts);

  return { ok: true, account: { id: account.id, name: account.name, email: account.email } };
}

/** Verify demo credentials. Never reveals whether the email or password was wrong. */
export function verifyAccount({ email, password } = {}) {
  const cleanEmail = normalizeEmail(email);
  const account = readAll().find((a) => a.email === cleanEmail);
  if (!account || account.pw !== hashPassword(password)) {
    return { ok: false, message: 'Incorrect email or password.' };
  }
  return { ok: true, account: { id: account.id, name: account.name, email: account.email } };
}

/** Test / "reset demo" helper — clears every locally-stored demo account. */
export function clearAccounts() {
  if (storageAvailable()) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}
