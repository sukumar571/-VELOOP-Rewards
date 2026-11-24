/**
 * ============================================================================
 * EARN LEDGER — what one account has redeemed on THIS deployment.
 * ============================================================================
 * The earning page credits codes on the server whenever the deployment has a
 * wallet it can post to. When it reports that it cannot (its wallet integration
 * is disabled, as on the shipped Vercel deployment), the credit is recorded here
 * instead: per account, in this browser's localStorage, so redeeming a code still
 * updates the balance the member sees and survives a reload.
 *
 * Consequences stated plainly, because the UI says so too:
 *   • the amounts are this deployment's own record, not the external VELOOP
 *     wallet, and they are not visible on another device;
 *   • a code is single-use per account, enforced on read and on credit;
 *   • nothing here is authoritative for joining a giveaway — the server decides
 *     that, and offers no local override.
 * ========================================================================= */

const STORAGE_KEY = 'veloop.earn.ledger.v1';
const CURRENCIES = ['VE', 'SVE', 'TOKEN'];

function readAll() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(all) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable (private mode) — the credit still applies this page load */
  }
}

function accountOf(all, accountKey) {
  const entry = all[accountKey];
  if (!entry || typeof entry !== 'object') return { balances: {}, redeemed: [] };
  return {
    balances: entry.balances && typeof entry.balances === 'object' ? entry.balances : {},
    redeemed: Array.isArray(entry.redeemed) ? entry.redeemed : [],
  };
}

/**
 * Balances earned through codes for one account. An account that has never
 * redeemed anything reports `{}` (no claim at all); once it has, every currency
 * is reported, defaulting to 0 so the three balances read consistently.
 */
export function balancesFor(accountKey) {
  if (!accountKey) return {};
  const { balances, redeemed } = accountOf(readAll(), accountKey);
  if (!redeemed.length) return {};
  const out = {};
  for (const c of CURRENCIES) out[c] = balances[c] ?? 0;
  return out;
}

/** Whether this account already redeemed the code. */
export function hasRedeemed(accountKey, code) {
  if (!accountKey || !code) return false;
  return accountOf(readAll(), accountKey).redeemed.includes(code);
}

/**
 * Credits one code once per account. Returns { ok, balance } — or
 * { ok:false, already:true } when the code was already used by this account.
 */
export function credit(accountKey, code, currency, amount) {
  if (!accountKey || !code || !currency) return { ok: false, balance: null };
  const all = readAll();
  const account = accountOf(all, accountKey);
  if (account.redeemed.includes(code)) {
    return { ok: false, already: true, balance: account.balances[currency] ?? 0 };
  }
  account.balances[currency] = (account.balances[currency] ?? 0) + amount;
  account.redeemed = [...account.redeemed, code];
  all[accountKey] = account;
  writeAll(all);
  return { ok: true, balance: account.balances[currency] };
}
