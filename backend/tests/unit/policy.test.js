/**
 * ============================================================================
 * POLICY UNIT TESTS — the business rules, with NO database and NO HTTP.
 * ============================================================================
 * These are the decisions the specification cares about (fail-closed eligibility,
 * configuration-driven fees, CSPRNG selection, masked winners, fulfilment shape).
 * Every one lives in a pure function so it can be proven here rather than only
 * through an integration path.
 * ========================================================================= */
const eligibility = require('../../src/services/eligibility.service.js');
const Prize = require('../../src/models/prize.model.js');
const winner = require('../../src/services/winner.service.js');
const claim = require('../../src/services/claim.service.js');
const { KYC_LEVEL, USER_STATUS } = require('../../src/config/constants.js');

/** Run `fn`, return the thrown ApiError (fails if nothing was thrown). */
function throwOf(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('Expected the call to throw, but it returned normally.');
}

describe('eligibility.evaluate — fail-closed policy', () => {
  it('refuses a geo-restricted draw when the country cannot be observed', () => {
    const verdict = eligibility.evaluate({ countries: ['US'] }, { user: { status: 'ACTIVE' }, geo: { country: null } });
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe('GEO_VERIFICATION_UNAVAILABLE');
  });

  it('allows a country on the allow-list and blocks one that is not', () => {
    const ok = eligibility.evaluate({ countries: ['US', 'GB'] }, { user: { status: 'ACTIVE' }, geo: { country: 'US' } });
    expect(ok.ok).toBe(true);
    const no = eligibility.evaluate({ countries: ['US'] }, { user: { status: 'ACTIVE' }, geo: { country: 'FR' } });
    expect(no.code).toBe('ELIGIBILITY_REQUIRED');
    expect(no.reason).toBe('COUNTRY_NOT_ALLOWED');
  });

  it('honours an excluded-country list', () => {
    const v = eligibility.evaluate({ excludedCountries: ['CN'] }, { user: { status: 'ACTIVE' }, geo: { country: 'CN' } });
    expect(v.reason).toBe('COUNTRY_EXCLUDED');
  });

  it('blocks blocked/suspended accounts regardless of anything else', () => {
    const v = eligibility.evaluate({}, { user: { status: USER_STATUS.BLOCKED } });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('ACCOUNT_STATUS_BLOCKED');
  });

  it('cannot verify a FULL KYC requirement and fails closed', () => {
    const v = eligibility.evaluate({ minKycLevel: KYC_LEVEL.FULL }, { user: { status: 'ACTIVE', kyc: { status: 'VERIFIED' } } });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('KYC_LEVEL_UNVERIFIABLE');
  });

  it('accepts BASIC KYC only when a verified document exists in the cache', () => {
    const unverified = eligibility.evaluate({ minKycLevel: KYC_LEVEL.BASIC }, { user: { status: 'ACTIVE', kyc: { status: 'PENDING' } } });
    expect(unverified.reason).toBe('KYC_LEVEL_INSUFFICIENT');
    const verified = eligibility.evaluate({ minKycLevel: KYC_LEVEL.BASIC }, { user: { status: 'ACTIVE', kyc: { status: 'VERIFIED' } } });
    expect(verified.ok).toBe(true);
  });

  it('enforces a minimum account age on the supplied clock', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const tooNew = eligibility.evaluate({ minAccountAgeDays: 30 }, { user: { status: 'ACTIVE', createdAt: new Date('2026-01-05T00:00:00Z') }, now });
    expect(tooNew.reason).toBe('ACCOUNT_TOO_NEW');
    const oldEnough = eligibility.evaluate({ minAccountAgeDays: 5 }, { user: { status: 'ACTIVE', createdAt: new Date('2026-01-01T00:00:00Z') }, now });
    expect(oldEnough.ok).toBe(true);
  });

  it('treats requireVerifiedEmail as presence-only (and says so in the check)', () => {
    const missing = eligibility.evaluate({ requireVerifiedEmail: true }, { user: { status: 'ACTIVE' } });
    expect(missing.reason).toBe('EMAIL_MISSING');
    const present = eligibility.evaluate({ requireVerifiedEmail: true }, { user: { status: 'ACTIVE', email: 'a@b.co' } });
    expect(present.ok).toBe(true);
    expect(present.checks.find((c) => c.rule === 'requireVerifiedEmail').asserted).toBe('presence-only');
  });

  it('assertEligible turns a failed verdict into the matching domain error', () => {
    const err = throwOf(() => eligibility.assertEligible({ countries: ['US'] }, { user: { status: 'ACTIVE' }, geo: {} }));
    expect(err.code).toBe('GEO_VERIFICATION_UNAVAILABLE');
    expect(err.statusCode).toBe(403);
  });
});

describe('Prize.resolveFee — fees come from configuration, never a literal', () => {
  const prize = {
    name: 'Tier 1',
    entryCurrency: 'VE',
    entryAmount: 50,
    feeOverrides: [{ currency: 'TOKEN', amount: 40 }],
  };

  it('returns the base fee for the prize currency', () => {
    expect(Prize.resolveFee(prize, 'VE')).toMatchObject({ currency: 'VE', amount: 50, source: 'base' });
  });

  it('defaults to the base currency when none is requested', () => {
    expect(Prize.resolveFee(prize)).toMatchObject({ currency: 'VE', amount: 50 });
  });

  it('returns a configured override for another currency', () => {
    expect(Prize.resolveFee(prize, 'TOKEN')).toMatchObject({ currency: 'TOKEN', amount: 40, source: 'override' });
  });

  it('refuses a currency it has no fee for (ENTRY_CURRENCY_NOT_ALLOWED)', () => {
    const err = throwOf(() => Prize.resolveFee(prize, 'SVE'));
    expect(err.code).toBe('ENTRY_CURRENCY_NOT_ALLOWED');
  });

  it('prices the supplied fee table exactly, per tier and per currency (no substitution)', () => {
    // Each tier resolves to the fee it configures; a currency it does not price is
    // refused rather than quietly charged in another currency.
    const table = [
      { entryCurrency: 'VE', entryAmount: 250, feeOverrides: [] },   // iPhone 15 Pro
      { entryCurrency: 'VE', entryAmount: 200, feeOverrides: [] },   // Apple Watch
      { entryCurrency: 'SVE', entryAmount: 500, feeOverrides: [] },  // AirPods
      { entryCurrency: 'VE', entryAmount: 500, feeOverrides: [] },   // Amazon voucher ₹2,000
      { entryCurrency: 'VE', entryAmount: 300, feeOverrides: [] },   // Amazon voucher ₹500
      { entryCurrency: 'TOKEN', entryAmount: 2000, feeOverrides: [] }, // ₹20 voucher
    ];
    expect(table.map((t) => Prize.resolveFee(t)).map((f) => f.amount)).toEqual([250, 200, 500, 500, 300, 2000]);
    // The SVE tier cannot be entered in VE: it prices only SVE.
    const sveErr = throwOf(() => Prize.resolveFee(table[2], 'VE'));
    expect(sveErr.code).toBe('ENTRY_CURRENCY_NOT_ALLOWED');
  });
});

describe('winner selection & draw gating', () => {
  const candidates = [
    { userId: 'a', entryCount: 1 },
    { userId: 'b', entryCount: 4 },
    { userId: 'c', entryCount: 2 },
  ];

  it('selects distinct candidates and never more than exist (RANDOM)', () => {
    const picked = winner.selectWinners(candidates, 2, 'RANDOM');
    expect(picked).toHaveLength(2);
    expect(new Set(picked.map((p) => p.userId)).size).toBe(2);
    const capped = winner.selectWinners(candidates, 99, 'RANDOM');
    expect(capped).toHaveLength(candidates.length);
  });

  it('weighted selection returns distinct winners with a ticket range', () => {
    const picked = winner.selectWinners(candidates, 2, 'WEIGHTED_BY_ENTRIES');
    expect(picked).toHaveLength(2);
    expect(new Set(picked.map((p) => p.userId)).size).toBe(2);
    picked.forEach((p) => expect(p.ticketRange).toMatch(/^\d{4}-\d{4}$/));
  });

  it('masked display never leaks identity and always has an alias', () => {
    const masked = winner.maskedDisplayFor({ _id: '507f1f77bcf86cd7994390aa', publicAlias: 'Member #4821', email: 'secret@x.co' });
    expect(masked.displayAlias).toBe('Member #4821');
    expect(JSON.stringify(masked)).not.toMatch(/secret@x\.co/);
    expect(masked.maskedUserId).toMatch(/^usr_/);
    // A user with no alias still gets a stable, non-identity label.
    const anon = winner.maskedDisplayFor({ _id: '507f1f77bcf86cd7994390ab' });
    expect(anon.displayAlias).toMatch(/^Member #/);
  });

  it('a draw is refused while the entry window is open', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const open = { endAt: new Date('2026-01-20T00:00:00Z'), status: 'ACTIVE', participation: {} };
    const err = throwOf(() => winner.assertDrawAllowed(open, now));
    expect(err.code).toBe('DRAW_WINDOW_OPEN');
    // After the window ends it is allowed.
    const ended = { endAt: new Date('2026-01-01T00:00:00Z'), status: 'ACTIVE', participation: {} };
    expect(winner.assertDrawAllowed(ended, now)).toBe(true);
    // An explicit ENDED status is allowed even at the boundary.
    const marked = { endAt: now, status: 'ENDED', participation: {} };
    expect(winner.assertDrawAllowed(marked, now)).toBe(true);
  });

  it('the claim window is read from giveaway config, falling back to the prize', () => {
    expect(winner.claimWindowDaysFor({ prizeConfig: { claimWindowDays: 14 } }, { claim: { windowDays: 7 } })).toBe(14);
    expect(winner.claimWindowDaysFor({ prizeConfig: {} }, { claim: { windowDays: 7 } })).toBe(7);
    expect(winner.claimWindowDaysFor({}, {})).toBeNull();
  });
});

describe('claim fulfilment shape & masking', () => {
  it('a FORM claim requires every physical field plus a valid country', () => {
    const claimRow = { claimType: 'FORM' };
    const err = throwOf(() => claim.validateFulfilment(claimRow, { physical: { fullName: 'X' } }));
    expect(err.code).toBe('CLAIM_DETAILS_INVALID');
    expect(err.details.missing).toEqual(expect.arrayContaining(['address', 'country']));

    const complete = {
      fullName: 'Jane', address: '1 Road', city: 'Town', state: 'ST', postalCode: '12345', phone: '+100', country: 'us',
    };
    const clean = claim.validateFulfilment(claimRow, { physical: complete });
    expect(clean.physical.country).toBe('US'); // normalised to uppercase
  });

  it('a DIGITAL_DELIVERY claim requires a delivery email and masks it', () => {
    const claimRow = { claimType: 'DIGITAL_DELIVERY' };
    const err = throwOf(() => claim.validateFulfilment(claimRow, { digital: {} }));
    expect(err.details.missing).toEqual(['deliveryEmail']);
    const clean = claim.validateFulfilment(claimRow, { digital: { deliveryEmail: 'jane@example.com' } });
    expect(clean.digital.deliveryTargetMasked).toBe('ja•••@example.com');
  });

  it('an AUTOMATIC claim requires no winner action (and refuses one)', () => {
    const err = throwOf(() => claim.validateFulfilment({ claimType: 'AUTOMATIC' }, {}));
    expect(err.code).toBe('CLAIM_DETAILS_INVALID');
  });

  it('maskEmail keeps the domain and hides the local part', () => {
    expect(claim.maskEmail('jane@example.com')).toBe('ja•••@example.com');
    expect(claim.maskEmail('not-an-email')).toBe('•••');
  });
});
