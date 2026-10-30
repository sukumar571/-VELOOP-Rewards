/**
 * ============================================================================
 * WALLET SERVICE — read-only view of the EXTERNAL VELOOP wallet.
 * ============================================================================
 * This application owns no balance. `GET /api/v1/wallet/balances` therefore
 * reports observations, and every observation is labelled with where it came from
 * and how old it is:
 *
 *   authoritative: true  — read from the wallet provider on this request
 *   authoritative: false — a cached snapshot (last provider observation, or a
 *                          clearly tagged dev fixture)
 *
 * When NO provider is configured and nothing has ever been observed, the endpoint
 * answers 503 WALLET_NOT_CONFIGURED rather than returning a zero balance: "we do
 * not know" is not the same statement as "you have 0".
 * ========================================================================= */
const WalletReference = require('../models/walletReference.model.js');
const Giveaway = require('../models/giveaway.model.js');
const wallet = require('../integrations/veloopWallet.js');
const { config } = require('../config/index.js');
const { domain } = require('../utils/domainErrors.js');
const { CURRENCIES, WALLET_SOURCE } = require('../config/constants.js');

function shape(row, { authoritative }) {
  return {
    currency: row.currency,
    balance: typeof row.balance === 'number' ? row.balance : null,
    observedAt: row.observedAt || null,
    source: row.source,
    stale: Boolean(row.stale),
    authoritative,
    fresh: Boolean(row.observedAt) && !row.stale
      && (Date.now() - new Date(row.observedAt).getTime()) <= config.wallet.snapshotMaxAgeSeconds * 1000,
  };
}

/** Currencies the live draws actually accept, so the UI asks about what matters. */
async function relevantCurrencies() {
  const open = await Giveaway.find({ published: true, status: { $in: ['ACTIVE', 'UPCOMING'] } })
    .select('participation.entryCurrencies')
    .lean();
  const set = new Set();
  for (const g of open) (g.participation?.entryCurrencies || []).forEach((c) => set.add(c));
  return set;
}

/**
 * @param {string} userId   internal identity (from the verified auth context)
 * @param {string[]} [currencies] explicit subset, validated against CURRENCIES
 */
async function balances({ userId, currencies } = {}) {
  const wanted = currencies && currencies.length ? currencies : CURRENCIES;
  const includeAll = !currencies || !currencies.length;

  const rows = await WalletReference.find({ userId, currency: { $in: wanted } }).lean();
  const byCurrency = new Map(rows.map((r) => [r.currency, r]));

  const items = [];
  for (const currency of wanted) {
    const cached = byCurrency.get(currency);
    if (wallet.isConfigured()) {
      try {
        const fresh = await wallet.getBalance({ userId, currency });
        await WalletReference.recordSnapshot(fresh, { isProduction: config.isProduction });
        items.push(shape(fresh, { authoritative: true }));
        continue;
      } catch (err) {
        await WalletReference.markStale(userId, currency, err.code || 'WALLET_ERROR');
        // A provider outage is reported per currency, not as a whole-page failure,
        // because a cached value may still be useful for display.
        items.push({
          currency,
          balance: cached && !cached.stale ? cached.balance : null,
          observedAt: cached ? cached.observedAt : null,
          source: cached ? cached.source : null,
          stale: true,
          authoritative: false,
          fresh: false,
          unavailableReason: err.code || 'WALLET_UNREACHABLE',
        });
        continue;
      }
    }
    if (cached) {
      items.push({ ...shape(cached, { authoritative: false }), unavailableReason: 'WALLET_NOT_CONFIGURED' });
    } else if (!includeAll) {
      // An explicitly requested currency we have never seen must be admitted.
      items.push({ currency, balance: null, observedAt: null, source: null, stale: true, authoritative: false, fresh: false, unavailableReason: 'NEVER_OBSERVED' });
    }
  }

  if (!wallet.isConfigured() && !items.length) throw domain('WALLET_NOT_CONFIGURED');

  const mode = wallet.mode();
  const integrationNote = mode === 'dev'
    // The in-DB dev adapter's balances are FICTIONAL fixtures, authoritative for THIS
    // app only. They are never real VELOOP funds and the mode is refused in prod.
    ? 'FICTIONAL development balances stored in this app\u2019s own database (DevWalletBalance). These are NOT real VELOOP funds; WALLET_MODE=dev is refused in production.'
    : wallet.isConfigured()
      ? 'Balances are read from the VELOOP wallet provider on each request.'
      : 'No wallet provider is configured (WALLET_MODE=disabled); only cached observations can be shown.';

  return {
    integration: {
      configured: wallet.isConfigured(),
      mode,
      snapshotMaxAgeSeconds: config.wallet.snapshotMaxAgeSeconds,
      note: integrationNote,
    },
    relevantCurrencies: includeAll ? [...(await relevantCurrencies())] : wanted,
    items,
    fixtureDataPresent: items.some((i) => i.source === WALLET_SOURCE.SEED_FIXTURE),
  };
}

module.exports = { balances, relevantCurrencies, shape };
