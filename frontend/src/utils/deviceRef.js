/**
 * ============================================================================
 * CLIENT REFERENCES — opaque correlation ids for the anti-fraud entry check.
 * ============================================================================
 * The join endpoint requires a device/session reference for draws whose config
 * sets `participation.requireDeviceReference` (the seeded dev draws do). They are
 * RANDOM opaque ids, not fingerprints: no user agent, screen size, IP or hardware
 * data is read here, and the server stores only salted hashes of them.
 *
 *  • device reference — persists in localStorage, so two accounts on one browser
 *    correlate the way a shared device should;
 *  • session reference — per tab (sessionStorage), so it resets with the session.
 * ========================================================================= */

const DEVICE_KEY = 'veloop.device.ref.v1';
const SESSION_KEY = 'veloop.session.ref.v1';

function randomId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replace(/-/g, '');
  } catch {
    /* fall through to the timestamp id */
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function readOrCreate(storage, key) {
  try {
    const existing = storage.getItem(key);
    if (existing) return existing;
    const created = randomId();
    storage.setItem(key, created);
    return created;
  } catch {
    // Storage unavailable (private mode): a per-call id is still a valid reference.
    return randomId();
  }
}

/** `{ deviceReference, sessionReference }` for the join body. */
export function clientReferences() {
  return {
    deviceReference: readOrCreate(window.localStorage, DEVICE_KEY),
    sessionReference: readOrCreate(window.sessionStorage, SESSION_KEY),
  };
}
