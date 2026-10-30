import { describe, it, expect, beforeEach } from 'vitest';
import {
  getClaimContext,
  getMyWonRecords,
  submitClaim,
  __resetClaimState,
} from '../services/claimService.js';
import { login, logout } from '../services/sessionService.js';

// Demo ledger (claims.mock.js), all fictional:
//   gv-009 PlayStation 5 (physical) -> demo user, NOT_SUBMITTED, open
//   gv-010 Sony headphones (physical) -> ANOTHER user, COMPLETED
//   gv-011 Swiggy voucher (digital)  -> demo user, deadline passed (EXPIRED)

const VALID_PHYSICAL = {
  fullName: 'Asha Kumar',
  phone: '9876543210',
  address: '12 MG Road',
  city: 'Pune',
  state: 'Maharashtra',
  pin: '411001',
};

beforeEach(async () => {
  __resetClaimState();
  await login(); // establishes the demo member (usr-demo-001)
});

describe('getClaimContext — server-authoritative winner matching', () => {
  it('confirms the winner of a published physical draw and marks it claimable', async () => {
    const ctx = await getClaimContext('gv-009');
    expect(ctx.authenticated).toBe(true);
    expect(ctx.published).toBe(true);
    expect(ctx.isWinner).toBe(true);
    expect(ctx.canClaim).toBe(true);
    expect(ctx.deliveryMode).toBe('physical');
    expect(ctx.fields.map((f) => f.name)).toContain('address');
  });

  it('does NOT reveal a claim to a non-winner of another account draw', async () => {
    const ctx = await getClaimContext('gv-010'); // owned by usr-other-5521
    expect(ctx.isWinner).toBe(false);
    expect(ctx.canClaim).toBe(false);
  });

  it('derives EXPIRED from the authoritative deadline for a passed claim', async () => {
    const ctx = await getClaimContext('gv-011');
    expect(ctx.status).toBe('EXPIRED');
    expect(ctx.canClaim).toBe(false);
  });

  it('hides everything from a signed-out visitor', async () => {
    await logout();
    const ctx = await getClaimContext('gv-009');
    expect(ctx.authenticated).toBe(false);
    expect(ctx.isWinner).toBe(false);
    expect(ctx.canClaim).toBe(false);
  });
});

describe('submitClaim — authorization chain', () => {
  it('rejects an UNAUTHORIZED claim from a non-winner (ownership verified server-side)', async () => {
    await expect(submitClaim('gv-010', VALID_PHYSICAL)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('rejects an EXPIRED claim', async () => {
    await expect(
      submitClaim('gv-011', { deliveryEmail: 'a@b.com' }),
    ).rejects.toMatchObject({ code: 'EXPIRED' });
  });

  it('rejects an INVALID form with per-field errors and does not record it', async () => {
    await expect(submitClaim('gv-009', { fullName: 'Asha' })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    const ctx = await getClaimContext('gv-009');
    expect(ctx.canClaim).toBe(true); // still unsubmitted
  });

  it('accepts a valid physical claim and advances the status', async () => {
    const res = await submitClaim('gv-009', VALID_PHYSICAL);
    expect(res).toMatchObject({ ok: true, status: 'SUBMITTED' });
    const ctx = await getClaimContext('gv-009');
    expect(ctx.status).toBe('SUBMITTED');
    expect(ctx.canClaim).toBe(false);
  });

  it('prevents a DUPLICATE submission after the first succeeds', async () => {
    await submitClaim('gv-009', VALID_PHYSICAL);
    await expect(submitClaim('gv-009', VALID_PHYSICAL)).rejects.toMatchObject({
      code: 'ALREADY_SUBMITTED',
    });
  });

  it('rejects when not authenticated', async () => {
    await logout();
    await expect(submitClaim('gv-009', VALID_PHYSICAL)).rejects.toMatchObject({
      code: 'NOT_AUTHENTICATED',
    });
  });
});

describe('getMyWonRecords — private, ownership-filtered', () => {
  it('returns only the current user’s won draws (never another member’s)', async () => {
    const list = await getMyWonRecords();
    const ids = list.map((r) => r.giveawayId).sort();
    expect(ids).toEqual(['gv-009', 'gv-011']); // gv-010 belongs to another account
    expect(list.find((r) => r.giveawayId === 'gv-011').status).toBe('EXPIRED');
  });

  it('is empty for signed-out visitors', async () => {
    await logout();
    expect(await getMyWonRecords()).toEqual([]);
  });
});
