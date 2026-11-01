/**
 * ============================================================================
 * EARN SERVICE — a LOCAL, demo-only "redeem a code → credit the wallet" flow.
 * ============================================================================
 * This exists so the "Earn More VEs" affordance does something visible in the
 * development demo WITHOUT a backend. It is emphatically NOT real earning:
 *   • it only runs when the development mocks are active (isMockEnabled());
 *   • it credits the same fictional in-browser session wallet the join flow
 *     debits (sessionService._store) — no real VELOOP funds move;
 *   • when the real API is wired up, redeemCode() refuses and says so.
 * Real VEs are earned on the external VELOOP platform (codes, tasks, activity),
 * which this project does not integrate. Kept deliberately small so the /earn
 * page and its tests can rely on it with no network.
 * ========================================================================= */
import { isMockEnabled } from '../config/env.js';
import { _store, isAuthenticatedSync } from './sessionService.js';

export const DEMO_DATA = true;

/** Fictional demo codes. Each is single-use per session (device). */
export const DEMO_CODES = [
  { code: 'VELOOP100', currency: 'VE', amount: 100, label: 'Starter bonus' },
  { code: 'WELCOME250', currency: 'VE', amount: 250, label: 'Welcome bonus' },
  { code: 'MEGA1000', currency: 'VE', amount: 1000, label: 'Flash promo' },
  { code: 'SOCIAL50', currency: 'SVE', amount: 50, label: 'Social task reward' },
  { code: 'TOKEN500', currency: 'TOKEN', amount: 500, label: 'Daily check-in' },
];

const BY_CODE = Object.fromEntries(DEMO_CODES.map((c) => [c.code, c]));

function delay(build, ms = 300) {
  return new Promise((resolve) =>
    setTimeout(() => resolve(typeof build === 'function' ? build() : build), ms),
  );
}

/** The code catalog for display, each tagged with whether it's already used. */
export function getDemoCodes() {
  return DEMO_CODES.map((c) => ({ ...c, redeemed: _store.hasRedeemed(c.code) }));
}

/**
 * Redeem a demo code. Returns { ok, code, currency, amount, balance } on success
 * or { ok:false, message } on any rejection. Never fabricates a real top-up.
 */
export async function redeemCode(rawCode) {
  if (!isMockEnabled()) {
    return {
      ok: false,
      message:
        'Earning VEs is handled by the real VELOOP platform — this build has no in-app wallet top-up.',
    };
  }

  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return delay({ ok: false, message: 'Enter a code to redeem.' });

  const reward = BY_CODE[code];
  if (!reward) {
    return delay({ ok: false, message: 'That code isn’t valid. Try one of the demo codes below.' });
  }
  if (!isAuthenticatedSync()) {
    return delay({ ok: false, message: 'Please sign in to credit your demo wallet.' });
  }
  if (_store.hasRedeemed(code)) {
    return delay({ ok: false, message: 'This code has already been redeemed on this device.' });
  }

  _store.credit(reward.currency, reward.amount);
  _store.addRedeem(code);

  return delay(() => ({
    ok: true,
    code,
    currency: reward.currency,
    amount: reward.amount,
    balance: _store.getBalance(reward.currency),
  }));
}
