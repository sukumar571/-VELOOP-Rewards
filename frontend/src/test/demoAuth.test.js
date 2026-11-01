/**
 * demoAuth — the local, browser-only demo account directory.
 * These tests pin the register → sign-in contract the LoginPage depends on and
 * assert the honesty guarantees (no plaintext password stored, generic failure).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerAccount,
  verifyAccount,
  hasAnyAccount,
  emailExists,
  clearAccounts,
  hashPassword,
} from '../services/demoAuth.js';

beforeEach(() => {
  clearAccounts();
});

describe('demoAuth.registerAccount', () => {
  it('creates an account and reports it exists', () => {
    const res = registerAccount({ name: 'Asha Kumar', email: 'Asha@Example.com', password: 'secret1' });
    expect(res.ok).toBe(true);
    expect(res.account.email).toBe('asha@example.com'); // normalized
    expect(hasAnyAccount()).toBe(true);
    expect(emailExists('asha@example.com')).toBe(true);
  });

  it('rejects a short name, bad email and short password with a field pointer', () => {
    expect(registerAccount({ name: 'A', email: 'a@b.co', password: 'secret1' })).toMatchObject({ ok: false, field: 'name' });
    expect(registerAccount({ name: 'Asha', email: 'nope', password: 'secret1' })).toMatchObject({ ok: false, field: 'email' });
    expect(registerAccount({ name: 'Asha', email: 'a@b.co', password: '123' })).toMatchObject({ ok: false, field: 'password' });
  });

  it('refuses a duplicate email', () => {
    registerAccount({ name: 'Asha', email: 'a@b.co', password: 'secret1' });
    const dup = registerAccount({ name: 'Asha 2', email: 'a@b.co', password: 'secret2' });
    expect(dup).toMatchObject({ ok: false, field: 'email' });
  });
});

describe('demoAuth.verifyAccount', () => {
  it('accepts the exact registered credentials', () => {
    registerAccount({ name: 'Asha', email: 'a@b.co', password: 'secret1' });
    expect(verifyAccount({ email: 'a@b.co', password: 'secret1' }).ok).toBe(true);
  });

  it('rejects a wrong password and an unknown email with the SAME generic message', () => {
    registerAccount({ name: 'Asha', email: 'a@b.co', password: 'secret1' });
    const wrongPw = verifyAccount({ email: 'a@b.co', password: 'nope' });
    const unknown = verifyAccount({ email: 'ghost@b.co', password: 'secret1' });
    expect(wrongPw.ok).toBe(false);
    expect(unknown.ok).toBe(false);
    expect(wrongPw.message).toBe(unknown.message); // no user-enumeration oracle
  });

  it('never stores the password in plaintext', () => {
    registerAccount({ name: 'Asha', email: 'a@b.co', password: 'secret1' });
    const raw = window.localStorage.getItem('veloop.demo.accounts.v1');
    expect(raw).not.toMatch(/secret1/);
    expect(raw).toContain(hashPassword('secret1'));
  });
});
