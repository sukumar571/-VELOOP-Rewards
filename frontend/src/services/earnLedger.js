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
 * The REDEEMED CODE LIST is the single source of truth. Balances are always
 * derived from it through the shared promo catalogue, so an entry can never show
 * a code as used while reporting no credit for it: whatever shape the stored
 * record is in, reading it back recomputes the amounts and repairs the record.
 *
 * Consequences stated plainly, because the UI says so too:
 *   • the amounts are this deployment's own record, not the external VELOOP
 *     wallet, and they are not visible on another device;
 *   • a code is single-use per account, enforced on read and on credit;
 *   • nothing here is authoritative for joining a giveaway — the server decides
 *     that, and offers no local override.
 * ========================================================================= */
import { findPromoCode } from '../config/promoCodes.js';

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

/** The redeemed code list for one account, whatever else the record holds. */
function redeemedOf(all, accountKey) {
  const entry = all[accountKey];
  const list = entry && typeof entry === 'object' ? entry.redeemed : null;
  return Array.isArray(list) ? list.filter((c) => typeof c === 'string') : [];
}

/**
 * Balances implied by a redeemed-code list. `related` is false when none of the
 * codes is still in the catalogue, so the caller can report nothing at all
 * rather than a row of zeros.
 */
function derive(redeemed) {
  const balances = { VE: 0, SVE: 0, TOKEN: 0 };
  let related = false;
  for (const code of redeemed) {
    const promo = findPromoCode(code);
    if (!promo) continue;
    related = true;
    balances[promo.currency] = (balances[promo.currency] ?? 0) + promo.amount;
  }
  return { balances, related };
}

/** Persists the derived balances so a stored record always matches its codes. */
function repair(all, accountKey, redeemed) {
  if (!redeemed.length) return;
  const { balances } = derive(redeemed);
  const next = { balances, redeemed };
  const current = all[accountKey];
  const same =
    current &&
    JSON.stringify(current.redeemed ?? null) === JSON.stringify(redeemed) &&
    CURRENCIES.every((c) => current.balances?.[c] === balances[c]);
  if (same) return;
  all[accountKey] = next;
  writeAll(all);
}

/**
 * Balances earned through codes for one account. An account with no redeemed
 * codes reports `{}` (no claim at all); once it has one, every currency is
 * reported, defaulting to 0 so the three balances read consistently.
 */
export function balancesFor(accountKey) {
  if (!accountKey) return {};
  const all = readAll();
  const redeemed = redeemedOf(all, accountKey);
  if (!redeemed.length) return {};
  const { balances, related } = derive(redeemed);
  if (!related) return {};
  repair(all, accountKey, redeemed);
  return { ...balances };
}

/** Whether this account already redeemed the code. */
export function hasRedeemed(accountKey, code) {
  if (!accountKey || !code) return false;
  return redeemedOf(readAll(), accountKey).includes(code);
}

/**
 * Credits one code once per account. Returns { ok, balance } — or
 * { ok:false, already:true } when the code was already used by this account.
 */
export function credit(accountKey, code, currency, amount) {
  if (!accountKey || !code || !currency) return { ok: false, balance: null };
  const all = readAll();
  const redeemed = redeemedOf(all, accountKey);
  if (redeemed.includes(code)) {
    const { balances } = derive(redeemed);
    return { ok: false, already: true, balance: balances[currency] ?? amount };
  }

  const next = [...redeemed, code];
  // Record every catalogue code, not just this one, so a record that was only
  // partly stored is repaired by the same write.
  const known = next.filter((c) => findPromoCode(c));
  const { balances } = derive(known);
  all[accountKey] = { balances, redeemed: next };
  writeAll(all);

  return { ok: true, balance: balances[currency] ?? amount };
}
