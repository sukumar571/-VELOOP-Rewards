/**
 * ============================================================================
 * REDEEM SERVICE — turn a promo code into a wallet credit.
 * ============================================================================
 * This only credits the DEVELOPMENT wallet adapter (`WALLET_MODE=dev`), whose
 * balances are fictional and live in this app's own database. It can never
 * invent a credit against the external VELOOP wallet: in `http` or `disabled`
 * mode redemption answers REDEEM_UNAVAILABLE instead of pretending.
 *
 * Order of operations matters:
 *   1. claim the redemption row (unique per user+code) so a retry cannot
 *      double-credit;
 *   2. credit the wallet atomically;
 *   3. on a credit failure, drop the claim so the code can be retried;
 *   4. refresh the cached WalletReference snapshot and write an audit entry.
 * ========================================================================= */
const { config } = require('../config/index.js');
const { domain } = require('../utils/domainErrors.js');
const { PROMO_CODES, normalizeCode, findPromoCode } = require('../config/promoCodes.js');
const CodeRedemption = require('../models/codeRedemption.model.js');
const WalletReference = require('../models/walletReference.model.js');
const AuditLog = require('../models/auditLog.model.js');
const wallet = require('../integrations/veloopWallet.js');
const { WALLET_SOURCE } = require('../config/constants.js');

/** Redemption is only honest where this app owns the balance (dev adapter). */
const redemptionAvailable = () => config.wallet.mode === 'dev';

/** The catalogue plus which codes this caller has already used. */
async function listCodes({ userId } = {}) {
  if (!redemptionAvailable()) return { redemptionAvailable: false, codes: [] };
  const rows = await CodeRedemption.find({ userId }).select('code').lean();
  const used = new Set(rows.map((r) => r.code));
  return {
    redemptionAvailable: true,
    codes: PROMO_CODES.map((c) => ({ ...c, redeemed: used.has(c.code) })),
  };
}

/**
 * Credits one code. Returns { code, currency, amount, balance }.
 * Throws REDEEM_UNAVAILABLE / REDEEM_CODE_INVALID / REDEEM_CODE_ALREADY_REDEEMED.
 */
async function redeem({ userId, code, requestId } = {}) {
  if (!redemptionAvailable()) throw domain('REDEEM_UNAVAILABLE');

  const normalized = normalizeCode(code);
  if (!normalized) throw domain('REDEEM_CODE_INVALID');
  const promo = findPromoCode(normalized);
  if (!promo) throw domain('REDEEM_CODE_INVALID');

  // Claim the code atomically BEFORE crediting: `updatedExisting` says the row
  // was already there, so a retry (or a double-click) cannot credit twice even
  // while the unique index is still being built on a fresh deployment.
  let claim;
  try {
    const claimed = await CodeRedemption.findOneAndUpdate(
      { userId, code: promo.code },
      { $setOnInsert: { currency: promo.currency, amount: promo.amount } },
      { upsert: true, new: true, setDefaultsOnInsert: true, includeResultMetadata: true },
    );
    if (claimed.lastErrorObject && claimed.lastErrorObject.updatedExisting) {
      throw domain('REDEEM_CODE_ALREADY_REDEEMED');
    }
    claim = claimed.value;
  } catch (err) {
    // The unique (userId, code) index remains the last line of defence.
    if (err && err.code === 11000) throw domain('REDEEM_CODE_ALREADY_REDEEMED');
    throw err;
  }
  if (!claim) throw domain('REDEEM_CODE_ALREADY_REDEEMED');

  let credited;
  try {
    credited = await wallet.credit({
      userId,
      currency: promo.currency,
      amount: promo.amount,
    });
  } catch (err) {
    // Nothing was credited: release the claim so the code is still usable.
    await CodeRedemption.deleteOne({ _id: claim._id }).catch(() => null);
    throw err;
  }

  const balance = typeof credited.balanceAfter === 'number' ? credited.balanceAfter : null;
  if (balance !== null) {
    claim.balanceAfter = balance;
    await claim.save().catch(() => null);
    await WalletReference.recordSnapshot(
      {
        userId,
        currency: promo.currency,
        balance,
        externalWalletId: null,
        observedAt: new Date(),
        source: WALLET_SOURCE.SEED_FIXTURE,
      },
      { isProduction: false },
    ).catch(() => null);
  }

  await AuditLog.record({
    actorId: userId,
    actorRole: 'user',
    action: 'wallet.promo.redeem',
    entityType: 'CodeRedemption',
    entityId: claim._id,
    after: {
      code: promo.code,
      currency: promo.currency,
      amount: promo.amount,
      balanceAfter: balance,
    },
    requestId,
  }).catch(() => null);

  return { code: promo.code, currency: promo.currency, amount: promo.amount, balance };
}

module.exports = { listCodes, redeem, redemptionAvailable };
