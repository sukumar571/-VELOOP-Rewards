/**
 * ============================================================================
 * ELIGIBILITY POLICY — evaluates a draw's declarative rules against an account.
 * ============================================================================
 * `Giveaway.eligibility` is DATA (countries, KYC level, account age, email,
 * blocked statuses). This module is the only place those fields are interpreted,
 * so a controller never grows an ad-hoc `if`. It is deliberately pure: it takes a
 * rules object + an account + a geo evidence object and returns a verdict, which
 * makes every rule unit-testable without a database.
 *
 * FAIL-CLOSED RULE (important, and honest): the specification's geo/KYC policies
 * are [PDF] and this workspace has NO geolocation provider and NO KYC provider.
 * So when a draw restricts by country or requires a KYC level this app cannot
 * observe, the answer is a refusal (`GEO_VERIFICATION_UNAVAILABLE` /
 * `ELIGIBILITY_REQUIRED`) — never a guess. Configure `ELIGIBILITY_GEO_SOURCE=header`
 * behind your own proxy, or connect a provider, to make those draws usable; the
 * refusal message says exactly that.
 * ========================================================================= */
const { config } = require('../config/index.js');
const { domain } = require('../utils/domainErrors.js');
const { KYC_LEVEL, USER_STATUS } = require('../config/constants.js');

const DAY_MS = 86_400_000;

/**
 * What the identity cache can actually prove about KYC. `User.kyc.status` is a
 * verification LIFECYCLE (UNKNOWN/PENDING/VERIFIED/REJECTED), not the spec's
 * evidence LEVEL, so only "some verified document exists" can be honoured.
 * Anything above that must fail closed rather than be invented.
 */
const KYC_EVIDENCE = Object.freeze({
  [KYC_LEVEL.NONE]: 0,
  [KYC_LEVEL.BASIC]: 1, // kyc.status === 'VERIFIED'
  [KYC_LEVEL.FULL]: 2, // requires document-level evidence this app does not have
});

const kycEvidenceOf = (user) => (user?.kyc?.status === 'VERIFIED' ? KYC_EVIDENCE[KYC_LEVEL.BASIC] : 0);

/** Coarse ISO-3166 alpha-2 country for the request, or null when unobservable. */
function resolveGeo(req) {
  const cfg = config.security.eligibility;
  if (cfg.geoSource !== 'header') return { country: null, source: 'none' };
  const raw = req.get(cfg.geoHeader);
  if (!raw) return { country: null, source: cfg.geoSource };
  const country = String(raw).trim().toUpperCase();
  return { country: /^[A-Z]{2}$/.test(country) ? country : null, source: cfg.geoSource };
}

function evaluate(eligibility = {}, { user = {}, geo = {}, now = new Date() } = {}) {
  const checks = [];

  // ---- blocked statuses (also enforced by resolveIdentity; kept so a service
  //      call that bypasses HTTP still cannot let a blocked account enter) -----
  const blocked = eligibility.blockedUserStatuses || [USER_STATUS.BLOCKED, USER_STATUS.SUSPENDED];
  if (blocked.includes(user.status)) {
    return { ok: false, code: 'ELIGIBILITY_REQUIRED', reason: 'ACCOUNT_STATUS_BLOCKED', checks };
  }
  checks.push({ ok: true, rule: 'blockedUserStatuses' });

  // ---- geo ------------------------------------------------------------------
  const restricted = (eligibility.countries || []).length > 0 || (eligibility.excludedCountries || []).length > 0;
  if (restricted) {
    if (!geo || !geo.country) {
      return { ok: false, code: 'GEO_VERIFICATION_UNAVAILABLE', reason: 'NO_COUNTRY_EVIDENCE', checks };
    }
    const allow = eligibility.countries || [];
    if (allow.length && !allow.includes(geo.country)) {
      return { ok: false, code: 'ELIGIBILITY_REQUIRED', reason: 'COUNTRY_NOT_ALLOWED', details: { country: geo.country }, checks };
    }
    if ((eligibility.excludedCountries || []).includes(geo.country)) {
      return { ok: false, code: 'ELIGIBILITY_REQUIRED', reason: 'COUNTRY_EXCLUDED', details: { country: geo.country }, checks };
    }
    checks.push({ ok: true, rule: 'countries', country: geo.country });
  }

  // ---- KYC ------------------------------------------------------------------
  const minKyc = eligibility.minKycLevel || KYC_LEVEL.NONE;
  if (KYC_EVIDENCE[minKyc] > 0) {
    if (minKyc === KYC_LEVEL.FULL) {
      return { ok: false, code: 'ELIGIBILITY_REQUIRED', reason: 'KYC_LEVEL_UNVERIFIABLE', checks };
    }
    if (kycEvidenceOf(user) < KYC_EVIDENCE[minKyc]) {
      return { ok: false, code: 'ELIGIBILITY_REQUIRED', reason: 'KYC_LEVEL_INSUFFICIENT', checks };
    }
    checks.push({ ok: true, rule: 'minKycLevel', minKyc });
  }

  // ---- account age ----------------------------------------------------------
  const minAge = eligibility.minAccountAgeDays || 0;
  if (minAge > 0) {
    if (!user.createdAt) {
      return { ok: false, code: 'ELIGIBILITY_REQUIRED', reason: 'ACCOUNT_AGE_UNKNOWN', checks };
    }
    const ageDays = (now.getTime() - new Date(user.createdAt).getTime()) / DAY_MS;
    if (ageDays < minAge) {
      return { ok: false, code: 'ELIGIBILITY_REQUIRED', reason: 'ACCOUNT_TOO_NEW', details: { ageDays: Math.floor(ageDays), minAccountAgeDays: minAge }, checks };
    }
    checks.push({ ok: true, rule: 'minAccountAgeDays', ageDays: Math.floor(ageDays) });
  }

  // ---- verified email -------------------------------------------------------
  if (eligibility.requireVerifiedEmail) {
    if (!user.email) {
      return { ok: false, code: 'ELIGIBILITY_REQUIRED', reason: 'EMAIL_MISSING', checks };
    }
    // The identity cache carries no email-verified flag, so this can only assert
    // presence. Documented in docs/API.md rather than silently treated as proof.
    checks.push({ ok: true, rule: 'requireVerifiedEmail', asserted: 'presence-only' });
  }

  return { ok: true, checks };
}

/** HTTP-facing helper: turn a failed verdict into the matching domain error. */
function assertEligible(eligibility, context) {
  const verdict = evaluate(eligibility, context);
  if (verdict.ok) return verdict;
  const details = { rule: verdict.reason, ...(verdict.details || {}) };
  if (verdict.code === 'GEO_VERIFICATION_UNAVAILABLE') {
    throw domain(
      verdict.code,
      'This giveaway is geo-restricted and the country of this request cannot be verified. Configure ELIGIBILITY_GEO_SOURCE or connect a geolocation provider.',
      details,
    );
  }
  throw domain(verdict.code, undefined, details);
}

module.exports = { evaluate, assertEligible, resolveGeo, KYC_EVIDENCE, DAY_MS };
