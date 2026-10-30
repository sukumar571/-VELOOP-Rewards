/**
 * ============================================================================
 * IDEMPOTENCY — pure decision logic, NO database.
 * ============================================================================
 * `computeRequestHash` and `classify` are the two brain-functions behind the
 * retried-join safety: a fingerprint of WHAT a key was used for, and the decision
 * of how to treat a retry. They are proven here without any connection so the
 * money-path concurrency test can focus purely on the transaction.
 * ========================================================================= */
const IdempotencyKey = require('../../src/models/idempotencyKey.model.js');

const GID = '507f1f77bcf86cd799439011';
const GID2 = '507f1f77bcf86cd799439012';
const PID = '507f1f77bcf86cd7994390aa';

describe('IdempotencyKey.computeRequestHash', () => {
  it('is stable and order-independent for the same logical request', () => {
    const a = IdempotencyKey.computeRequestHash({ giveawayId: GID, prizeId: PID, currency: 'VE', entries: 1 });
    const b = IdempotencyKey.computeRequestHash({ giveawayId: GID, prizeId: PID, currency: 'VE', entries: 1 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when any priced field changes (a different request is a different hash)', () => {
    const base = IdempotencyKey.computeRequestHash({ giveawayId: GID, prizeId: PID, currency: 'VE', entries: 1 });
    const diffGiveaway = IdempotencyKey.computeRequestHash({ giveawayId: GID2, prizeId: PID, currency: 'VE', entries: 1 });
    const diffCurrency = IdempotencyKey.computeRequestHash({ giveawayId: GID, prizeId: PID, currency: 'TOKEN', entries: 1 });
    const diffEntries = IdempotencyKey.computeRequestHash({ giveawayId: GID, prizeId: PID, currency: 'VE', entries: 2 });
    expect(new Set([base, diffGiveaway, diffCurrency, diffEntries]).size).toBe(4);
  });

  it('normalises an absent prizeId and coerces entries so equivalent calls collide', () => {
    const noPrize = IdempotencyKey.computeRequestHash({ giveawayId: GID, currency: 'VE', entries: '3' });
    const explicitNull = IdempotencyKey.computeRequestHash({ giveawayId: GID, prizeId: null, currency: 'VE', entries: 3 });
    expect(noPrize).toBe(explicitNull);
  });
});

describe('IdempotencyKey.classify', () => {
  const hash = IdempotencyKey.computeRequestHash({ giveawayId: GID, currency: 'VE', entries: 1 });
  const other = IdempotencyKey.computeRequestHash({ giveawayId: GID2, currency: 'VE', entries: 1 });
  const { STATUS } = IdempotencyKey;

  it('NEW when no prior row exists', () => {
    expect(IdempotencyKey.classify(null, hash)).toBe('NEW');
    expect(IdempotencyKey.classify(undefined, hash)).toBe('NEW');
  });

  it('CONFLICT when the same key was used for a different request (checked first)', () => {
    expect(IdempotencyKey.classify({ status: STATUS.COMPLETE, requestHash: other }, hash)).toBe('CONFLICT');
    expect(IdempotencyKey.classify({ status: STATUS.IN_PROGRESS, requestHash: other }, hash)).toBe('CONFLICT');
  });

  it('REPLAY for a completed matching request, IN_PROGRESS for an in-flight one', () => {
    expect(IdempotencyKey.classify({ status: STATUS.COMPLETE, requestHash: hash }, hash)).toBe('REPLAY');
    expect(IdempotencyKey.classify({ status: STATUS.IN_PROGRESS, requestHash: hash }, hash)).toBe('IN_PROGRESS');
  });

  it('allows a genuinely FAILED attempt to be retried (NEW)', () => {
    expect(IdempotencyKey.classify({ status: STATUS.FAILED, requestHash: hash }, hash)).toBe('NEW');
  });
});
