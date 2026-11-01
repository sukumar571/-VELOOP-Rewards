import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { redeemCode, getDemoCodes, DEMO_CODES } from '../services/earnService.js';
import { login, logout, _store } from '../services/sessionService.js';
import { setMockEnabled } from '../config/env.js';

// The demo wallet starts at VE:300 / SVE:120 / TOKEN:1500 (sessionService).
// login() resets the store (balances + redeemed) so each test is isolated.

beforeEach(async () => {
  setMockEnabled(true);
  await login(); // establishes the demo member and a fresh wallet
});

afterEach(() => {
  setMockEnabled(true); // never leak the real-mode toggle into other files
});

describe('redeemCode — demo wallet top-up', () => {
  it('credits a valid code and returns the new balance', async () => {
    const res = await redeemCode('WELCOME250');
    expect(res).toMatchObject({ ok: true, code: 'WELCOME250', currency: 'VE', amount: 250 });
    expect(res.balance).toBe(550); // 300 + 250
    expect(_store.getBalance('VE')).toBe(550);
  });

  it('is case-insensitive and trims surrounding whitespace', async () => {
    const res = await redeemCode('  welcome250  ');
    expect(res.ok).toBe(true);
    expect(_store.getBalance('VE')).toBe(550);
  });

  it('credits the correct currency per code', async () => {
    await redeemCode('SOCIAL50');
    expect(_store.getBalance('SVE')).toBe(170); // 120 + 50
    await redeemCode('TOKEN500');
    expect(_store.getBalance('TOKEN')).toBe(2000); // 1500 + 500
  });

  it('rejects an unknown code without changing the balance', async () => {
    const before = _store.getBalance('VE');
    const res = await redeemCode('NOT_A_CODE');
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/isn.t valid/i);
    expect(_store.getBalance('VE')).toBe(before);
  });

  it('rejects an empty code', async () => {
    const res = await redeemCode('   ');
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/enter a code/i);
  });

  it('refuses to redeem the same code twice on one device', async () => {
    const first = await redeemCode('VELOOP100');
    const second = await redeemCode('VELOOP100');
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.message).toMatch(/already been redeemed/i);
    expect(_store.getBalance('VE')).toBe(400); // credited once
  });

  it('requires a signed-in member to credit the wallet', async () => {
    await logout();
    const res = await redeemCode('MEGA1000');
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/sign in/i);
  });

  it('refuses to fabricate a top-up when the real API is wired up', async () => {
    setMockEnabled(false);
    const res = await redeemCode('MEGA1000');
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/real VELOOP platform/i);
  });
});

describe('getDemoCodes — catalog for display', () => {
  it('lists every code and flags the ones already redeemed', async () => {
    await redeemCode('WELCOME250');
    const catalog = getDemoCodes();
    expect(catalog).toHaveLength(DEMO_CODES.length);
    expect(catalog.find((c) => c.code === 'WELCOME250').redeemed).toBe(true);
    expect(catalog.find((c) => c.code === 'VELOOP100').redeemed).toBe(false);
  });
});
