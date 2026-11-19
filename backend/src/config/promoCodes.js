/**
 * ============================================================================
 * PROMO CODES — the codes the `/wallet/redeem` endpoint accepts.
 * ============================================================================
 * These are DEVELOPMENT promotion codes. They are only redeemable when the
 * wallet adapter runs in `dev` mode (fictional in-database balances); with the
 * real `http` wallet or with the wallet disabled, redemption is refused rather
 * than inventing a credit against a wallet this app does not own.
 *
 * Codes and amounts live here (server-side) so a client can never submit its own
 * amount: the request carries a code, the credit is decided here.
 * ========================================================================= */

const PROMO_CODES = Object.freeze([
  Object.freeze({ code: 'VELOOP100', currency: 'VE', amount: 100, label: 'Starter bonus' }),
  Object.freeze({ code: 'WELCOME250', currency: 'VE', amount: 250, label: 'Welcome bonus' }),
  Object.freeze({ code: 'MEGA1000', currency: 'VE', amount: 1000, label: 'Flash promo' }),
  Object.freeze({ code: 'SOCIAL50', currency: 'SVE', amount: 50, label: 'Social task reward' }),
  Object.freeze({ code: 'TOKEN500', currency: 'TOKEN', amount: 500, label: 'Daily check-in' }),
]);

const BY_CODE = new Map(PROMO_CODES.map((c) => [c.code, c]));

/** Normalizes user input the same way everywhere (trim, upper-case). */
function normalizeCode(raw) {
  return String(raw ?? '').trim().toUpperCase();
}

/** The promo for a normalized code, or undefined. */
function findPromoCode(raw) {
  return BY_CODE.get(normalizeCode(raw));
}

module.exports = { PROMO_CODES, normalizeCode, findPromoCode };
