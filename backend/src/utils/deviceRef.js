/**
 * ============================================================================
 * DEVICE REFERENCE — privacy-preserving correlation tokens for entry fraud.
 * ============================================================================
 * The anti-fraud layer needs to notice "five accounts entered this draw from one
 * device". The GiveawayParticipation.deviceRef block therefore stores SALTED
 * HASHES and a coarse client class only — never a raw user-agent, never an IP
 * address, never a hardware identifier. Values shorter than 8 characters are
 * ignored: they are far too collision-prone to correlate anything.
 * ========================================================================= */
const { hashReference } = require('./schema.js');

const MIN_REFERENCE_LENGTH = 8;

const clean = (value) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length >= MIN_REFERENCE_LENGTH ? trimmed : undefined;
};

/**
 * Coarse bucket only ('desktop-chrome'), so the fingerprint of the full UA string
 * is not needed and no UA string is retained. Unknown clients stay generic.
 */
function classifyClient(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return undefined;
  const platform = /ipad|android|mobile|iphone/.test(ua) ? 'mobile' : 'desktop';
  let family = 'unknown';
  if (ua.includes('edg')) family = 'edge';
  else if (ua.includes('opr') || ua.includes('opera')) family = 'opera';
  else if (ua.includes('firefox')) family = 'firefox';
  else if (ua.includes('chrome') || ua.includes('crios')) family = 'chrome';
  else if (ua.includes('safari')) family = 'safari';
  return `${platform}-${family}`.slice(0, 60);
}

/**
 * @param {object} input  client-supplied references + server-observed context
 * @returns {{deviceHash?: string, sessionHash?: string, ipHash?: string,
 *            country?: string, clientClass?: string}}
 */
function buildDeviceRef({ deviceReference, sessionReference, userAgent, ip, geo } = {}) {
  const ref = {};
  const device = clean(deviceReference);
  if (device) ref.deviceHash = hashReference(device);
  const session = clean(sessionReference);
  if (session) ref.sessionHash = hashReference(session);
  if (ip) ref.ipHash = hashReference(ip);
  if (geo && geo.country) ref.country = geo.country;
  const klass = classifyClient(userAgent);
  if (klass) ref.clientClass = klass;
  return ref;
}

/** True when the client supplied at least one usable correlation reference. */
function hasClientReference(ref = {}) {
  return Boolean(ref.deviceHash || ref.sessionHash);
}

module.exports = { buildDeviceRef, classifyClient, hasClientReference, MIN_REFERENCE_LENGTH };
