/**
 * ============================================================================
 * PROMO CODES — the codes the earning page offers.
 * ============================================================================
 * This is the CLIENT MIRROR of backend/src/config/promoCodes.js: the same code,
 * currency and amount for each entry. The server stays authoritative for every
 * real credit (the client only ever sends a code, never an amount); this copy
 * exists so the catalogue can be listed and validated when the deployment has no
 * wallet it can reach. Keep the two lists in step.
 * ========================================================================= */

export const PROMO_CODES = Object.freeze([
  Object.freeze({ code: 'VELOOP100', currency: 'VE', amount: 100, label: 'Starter bonus' }),
  Object.freeze({ code: 'WELCOME250', currency: 'VE', amount: 250, label: 'Welcome bonus' }),
  Object.freeze({ code: 'MEGA1000', currency: 'VE', amount: 1000, label: 'Flash promo' }),
  Object.freeze({ code: 'SOCIAL50', currency: 'SVE', amount: 50, label: 'Social task reward' }),
  Object.freeze({ code: 'TOKEN500', currency: 'TOKEN', amount: 500, label: 'Daily check-in' }),
]);

const BY_CODE = new Map(PROMO_CODES.map((c) => [c.code, c]));

/** Normalizes user input the same way the server does (trim, upper-case). */
export function normalizeCode(raw) {
  return String(raw ?? '').trim().toUpperCase();
}

/** The promo for a code, or undefined. */
export function findPromoCode(raw) {
  return BY_CODE.get(normalizeCode(raw));
}
