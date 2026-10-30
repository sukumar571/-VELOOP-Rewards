/**
 * ============================================================================
 * VELOOP WALLET ADAPTER — the only place that talks to the wallet.
 * ============================================================================
 * The giveaway app does NOT own a balance. Balances live in the existing VELOOP
 * wallet, which is an EXTERNAL system. No wallet API contract, endpoint or
 * credential was provided with this repository, therefore:
 *
 *   mode 'disabled' (default) — every method throws WALLET_NOT_CONFIGURED.
 *       Nothing here ever returns a made-up balance or a fake "debit ok".
 *   mode 'dev' — an ISOLATED development/test adapter. FICTIONAL authoritative
 *       balances live in the `DevWalletBalance` collection of THIS database, so a
 *       paid join can debit + record + audit inside ONE real MongoDB transaction.
 *       Every observation is tagged SEED_FIXTURE (never VELOOP_API) and the config
 *       gate refuses this mode in production — it is NOT a connection to VELOOP.
 *   mode 'http'  — a real, thin REST client. You supply the base URL, the key
 *       and the path templates (with {userId}/{currency} placeholders) that match
 *       YOUR wallet service; the balance is read from `WALLET_BALANCE_FIELD`.
 *       This transport runs OUTSIDE any local transaction; a debit is coordinated
 *       by the idempotency key sent to the provider plus a compensating reversal
 *       on later failure — never by pretending a Mongo transaction covers it.
 *       Tests cover this client against a local test server, which proves the
 *       client works — it is NOT evidence of a connection to VELOOP.
 *
 * Swap-in point for a different transport (gRPC, service discovery, SDK):
 * implement the same three methods and return the same result shapes.
 * ========================================================================= */
const { config } = require('../config/index.js');
const { ApiError } = require('../utils/ApiError.js');
const { WALLET_SOURCE } = require('../config/constants.js');
const crypto = require('crypto');
const DevWalletBalance = require('../models/devWalletBalance.model.js');

/** Stable machine-coded failure that the error handler passes through as-is. */
function fail(status, code, message, details) {
  return new ApiError(status, code, message, details);
}

const notConfigured = () =>
  fail(
    503,
    'WALLET_NOT_CONFIGURED',
    'Wallet integration is not configured. Set WALLET_MODE=http with WALLET_BASE_URL, WALLET_API_KEY and the path templates.',
  );

function fill(template, vars) {
  return Object.entries(vars).reduce(
    (url, [key, value]) => url.replaceAll(`{${key}}`, encodeURIComponent(String(value))),
    template,
  );
}

function requireHttp(cfg, { needBalance, needDebit } = {}) {
  if (!cfg.baseUrl || !cfg.apiKey) throw notConfigured();
  if (needBalance && !cfg.balancePath) throw notConfigured();
  if (needDebit && !cfg.debitPath) throw notConfigured();
}

/**
 * Performs the request with a hard timeout and returns the parsed JSON body.
 * Any non-2xx becomes a 503 carrying only the provider status — never the
 * provider's body, which may contain account data.
 */
async function callJson(method, path, { body, idempotencyKey } = {}) {
  const cfg = config.wallet;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  const url = `${String(cfg.baseUrl).replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    throw fail(503, 'WALLET_UNREACHABLE', 'Wallet provider unreachable.', {
      reason: err.name === 'AbortError' ? 'timeout' : 'network',
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw fail(503, 'WALLET_PROVIDER_ERROR', 'Wallet provider rejected the request.', {
      providerStatus: response.status,
    });
  }

  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw fail(503, 'WALLET_BAD_RESPONSE', 'Wallet provider returned a non-JSON body.');
  }
}

/** Numeric field extraction, so a malformed provider response is never guessed at. */
function pickNumber(payload, field) {
  return typeof payload?.[field] === 'number' && Number.isFinite(payload[field]) ? payload[field] : null;
}

/** Reads the authoritative balance for one user + currency. */
async function getBalance({ userId, currency, session } = {}) {
  const cfg = config.wallet;
  if (cfg.mode === 'dev') {
    // Fictional but authoritative for this app; an absent row is a real 0 balance.
    const row = await DevWalletBalance.readBalance({ userId, currency, session });
    return {
      userId: String(userId),
      currency,
      balance: row ? row.balance : 0,
      externalWalletId: null,
      observedAt: new Date(),
      source: WALLET_SOURCE.SEED_FIXTURE,
    };
  }
  if (cfg.mode !== 'http') throw notConfigured();
  requireHttp(cfg, { needBalance: true });

  const payload = await callJson('GET', fill(cfg.balancePath, { userId, currency }));
  const balance = pickNumber(payload, cfg.balanceField);
  if (balance === null) {
    throw fail(503, 'WALLET_BAD_RESPONSE', 'Wallet provider response is missing a numeric balance.', {
      field: cfg.balanceField,
    });
  }
  return {
    userId: String(userId),
    currency,
    balance,
    externalWalletId: payload.walletId ? String(payload.walletId) : null,
    observedAt: new Date(),
    source: WALLET_SOURCE.VELOOP_API,
  };
}

/**
 * Debits an entry fee. The caller MUST supply an idempotency key; it is sent to
 * the provider AND stored on our ledger row, so a retry cannot double-charge.
 */
async function debit({ userId, currency, amount, idempotencyKey, reference, session } = {}) {
  const cfg = config.wallet;
  if (cfg.mode === 'dev') {
    if (!idempotencyKey) {
      throw fail(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A wallet debit requires an idempotency key.');
    }
    const res = await DevWalletBalance.debit({ userId, currency, amount, session });
    if (!res) {
      throw fail(402, 'INSUFFICIENT_BALANCE', 'The wallet balance is too low for this entry.', {
        currency, required: amount,
      });
    }
    return {
      status: 'SUCCESS',
      externalTransactionId: `dev_${crypto.randomUUID()}`,
      balanceBefore: res.balanceBefore,
      balanceAfter: res.balanceAfter,
    };
  }
  if (cfg.mode !== 'http') throw notConfigured();
  requireHttp(cfg, { needDebit: true });
  if (!idempotencyKey) {
    throw fail(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A wallet debit requires an idempotency key.');
  }

  const payload = await callJson('POST', fill(cfg.debitPath, { userId, currency }), {
    body: { amount, reference, currency, accountRef: String(userId) },
    idempotencyKey,
  });

  return {
    // A 2xx from the provider is the only thing that lets us call this SUCCESS.
    status: 'SUCCESS',
    externalTransactionId: payload.transactionId ? String(payload.transactionId) : null,
    balanceBefore: pickNumber(payload, 'balanceBefore'),
    balanceAfter: pickNumber(payload, cfg.balanceField),
  };
}

/** Credits a previously debited amount back (the compensating wallet action). */
async function reverse({ userId, currency, amount, idempotencyKey, reference, externalTransactionId, session } = {}) {
  const cfg = config.wallet;
  if (cfg.mode === 'dev') {
    if (!idempotencyKey) {
      throw fail(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A wallet reversal requires an idempotency key.');
    }
    const res = await DevWalletBalance.credit({ userId, currency, amount, session });
    return {
      status: 'SUCCESS',
      externalTransactionId: `devrev_${crypto.randomUUID()}`,
      balanceAfter: res ? res.balanceAfter : null,
    };
  }
  if (cfg.mode !== 'http') throw notConfigured();
  requireHttp(cfg, { needDebit: true });
  if (!idempotencyKey) {
    throw fail(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A wallet reversal requires an idempotency key.');
  }
  // Some providers model a refund as a signed debit; reversePath overrides.
  const path = cfg.reversePath || cfg.debitPath;

  const payload = await callJson('POST', fill(path, { userId, currency }), {
    body: { amount, reference, currency, accountRef: String(userId), originalTransactionId: externalTransactionId },
    idempotencyKey,
  });

  return {
    status: 'SUCCESS',
    externalTransactionId: payload.transactionId ? String(payload.transactionId) : null,
    balanceAfter: pickNumber(payload, cfg.balanceField),
  };
}

/** True only when a balance/charge call could actually be made right now. */
function isConfigured() {
  const cfg = config.wallet;
  if (cfg.mode === 'dev') return true; // in-database dev adapter is always ready
  return cfg.mode === 'http' && Boolean(cfg.baseUrl && cfg.apiKey && cfg.balancePath && cfg.debitPath);
}

module.exports = { getBalance, debit, reverse, isConfigured, mode: () => config.wallet.mode };
