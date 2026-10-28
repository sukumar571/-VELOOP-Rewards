/**
 * ============================================================================
 * CURRENCY REGISTRY — generic handling of every entry currency.
 * ============================================================================
 * Entry fees, balances and the projected-after-joining figure are all rendered
 * through this registry by currency CODE. No component hard-codes a currency
 * name or a prize-name check (e.g. `prizeName === 'Amazon'`). Adding a new
 * currency is a single entry here.
 *
 * Balance semantics, top-up flows and refund rules are [PDF]/backend-pending —
 * this module only describes how each currency is DISPLAYED.
 * ========================================================================= */

export const CURRENCIES = {
  VE: {
    code: 'VE',
    label: 'VEs',
    longName: 'Virtual Earnings',
    // groupDigits: thousands separators are applied on display.
    groupDigits: true,
    accent: 've',
  },
  SVE: {
    code: 'SVE',
    label: 'SVEs',
    longName: 'Social Virtual Earnings',
    groupDigits: true,
    accent: 'sve',
  },
  TOKEN: {
    code: 'TOKEN',
    label: 'Tokens',
    longName: 'Reward Token',
    groupDigits: true,
    accent: 'token',
  },
};

/** Safe lookup — unknown codes fall back to a neutral display so the UI never
 *  crashes on new currency data before the registry is updated. */
export function getCurrency(code) {
  return (
    CURRENCIES[code] ?? {
      code: String(code),
      label: String(code),
      longName: String(code),
      groupDigits: false,
      accent: 've',
    }
  );
}

/** Format an amount for a given currency code (display only). */
export function formatAmount(code, amount) {
  const c = getCurrency(code);
  const n = Number(amount) || 0;
  const value = c.groupDigits ? n.toLocaleString('en-IN') : String(n);
  return `${value} ${c.label}`;
}

/** Numeric-only grouped string (no currency label). */
export function formatAmountValue(code, amount) {
  const c = getCurrency(code);
  const n = Number(amount) || 0;
  return c.groupDigits ? n.toLocaleString('en-IN') : String(n);
}
