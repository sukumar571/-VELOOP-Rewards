/**
 * ============================================================================
 * CONFIGURATION — single, environment-derived source of truth.
 * ============================================================================
 * Reads process.env (loaded from the git-ignored backend/.env). Non-secret
 * defaults make local development work without a .env; production is gated by
 * validateRuntimeConfig(), which REFUSES to boot with missing secrets or the
 * dev-mock auth mode. No real credential value is ever hard-coded here.
 * ========================================================================= */
const path = require('path');
const dotenv = require('dotenv');

// Load backend/.env regardless of the current working directory.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';
const IS_TEST = NODE_ENV === 'test';

function toInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}
function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true' || value === true;
}
function toList(value, fallback = []) {
  if (!value) return fallback;
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const config = {
  env: NODE_ENV,
  isProduction: IS_PROD,
  isTest: IS_TEST,

  server: {
    port: toInt(process.env.PORT, 4000),
    // Trust proxy hops for correct client IPs (rate limiting / logging). Off by
    // default so a directly-exposed app cannot be spoofed via X-Forwarded-For.
    trustProxy:
      process.env.TRUST_PROXY === undefined
        ? false
        : toBool(process.env.TRUST_PROXY, false) || toInt(process.env.TRUST_PROXY, 0),
    exitOnDbFailure: toBool(process.env.EXIT_ON_DB_FAILURE, IS_PROD),
    gracefulTimeoutMs: toInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS, 10000),
  },

  mongo: {
    uri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/veloop_giveaway',
    serverSelectionTimeoutMs: toInt(
      process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
      5000,
    ),
    maxPoolSize: toInt(process.env.MONGODB_MAX_POOL_SIZE, 20),
  },

  logging: {
    level: IS_TEST ? (process.env.LOG_LEVEL || 'silent') : process.env.LOG_LEVEL || 'info',
    // Sensitive paths scrubbed by the logger. Covers auth headers/cookies plus
    // common credential/PII keys wherever they appear in a logged object — both
    // at the top level and one or more levels deep (pino's fast-redact syntax).
    redact: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      // top-level secrets/PII
      'password',
      'passwd',
      'secret',
      'token',
      'accessToken',
      'refreshToken',
      'idToken',
      'jwt',
      'authorization',
      'creditCard',
      'cardNumber',
      'cvv',
      'pin',
      // nested secrets/PII (one level)
      '*.password',
      '*.passwd',
      '*.secret',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.idToken',
      '*.jwt',
      '*.authorization',
      '*.creditCard',
      '*.cardNumber',
      '*.cvv',
      '*.pin',
    ],
  },

  auth: {
    // 'jwt' verifies real VELOOP-issued tokens; 'dev-mock' is local/test only.
    mode: process.env.AUTH_MODE || (IS_PROD ? 'jwt' : 'dev-mock'),
    jwtSecret: process.env.JWT_SECRET || '',
    jwtPublicKey: process.env.JWT_PUBLIC_KEY || '',
    algorithms: toList(process.env.JWT_ALGORITHMS, ['HS256']),
    issuer: process.env.JWT_ISSUER || '',
    audience: process.env.JWT_AUDIENCE || '',
    devSecret: process.env.DEV_JWT_SECRET || 'change-me-local-dev-only',
    devTokenTtlSeconds: toInt(process.env.DEV_JWT_TTL_SECONDS, 8 * 60 * 60),
  },

  /**
   * VELOOP wallet integration. There is NO wallet system, contract or credential
   * in this repository, so the default mode is 'disabled' — every call then fails
   * loudly instead of inventing a balance. 'http' is the seam to configure once
   * the real contract is supplied (paths use {userId}/{currency} placeholders).
   */
  wallet: {
    mode: process.env.WALLET_MODE || 'disabled', // 'disabled' | 'http'
    baseUrl: process.env.WALLET_BASE_URL || '',
    apiKey: process.env.WALLET_API_KEY || '',
    balancePath: process.env.WALLET_BALANCE_PATH || '',
    debitPath: process.env.WALLET_DEBIT_PATH || '',
    reversePath: process.env.WALLET_REVERSE_PATH || '',
    balanceField: process.env.WALLET_BALANCE_FIELD || 'balance',
    timeoutMs: toInt(process.env.WALLET_TIMEOUT_MS, 5000),
    /** How long a cached balance snapshot may be trusted for eligibility checks. */
    snapshotMaxAgeSeconds: toInt(process.env.WALLET_SNAPSHOT_MAX_AGE_SECONDS, 120),
  },

  security: {
    corsOrigins: toList(process.env.CORS_ORIGINS, [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ]),
    jsonBodyLimit: process.env.JSON_BODY_LIMIT || '100kb',
    rateLimit: {
      windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 60 * 1000),
      max: toInt(process.env.RATE_LIMIT_MAX, 300),
      authMax: toInt(process.env.RATE_LIMIT_AUTH_MAX, 10),
    },
  },
};

/**
 * Fail-fast assertions for production. Called by server.js before it binds a
 * port. Also enforces that the dev-mock auth mode can never run in production.
 */
function validateRuntimeConfig(cfg = config) {
  const problems = [];

  if (cfg.env === 'production') {
    if (!cfg.mongo.uri) problems.push('MONGODB_URI is required in production.');

    if (cfg.auth.mode === 'dev-mock') {
      problems.push('AUTH_MODE=dev-mock is forbidden in production (no real identity).');
    }
    if (cfg.auth.mode === 'jwt' && !cfg.auth.jwtSecret && !cfg.auth.jwtPublicKey) {
      problems.push('AUTH_MODE=jwt requires JWT_SECRET (HMAC) or JWT_PUBLIC_KEY (RSA/EC).');
    }
    if (cfg.auth.devSecret === 'change-me-local-dev-only') {
      problems.push('DEV_JWT_SECRET must be changed away from its default value.');
    }
    const usesWildcardOrEmpty =
      cfg.security.corsOrigins.length === 0 || cfg.security.corsOrigins.includes('*');
    if (usesWildcardOrEmpty) {
      problems.push('CORS_ORIGINS must be an explicit allow-list in production.');
    }

    // A half-configured wallet seam is worse than an absent one: it would look
    // connected while silently failing every debit. Require complete config.
    const wallet = cfg.wallet || {};
    if (wallet.mode === 'http') {
      if (!wallet.baseUrl || !wallet.apiKey) {
        problems.push('WALLET_MODE=http requires WALLET_BASE_URL and WALLET_API_KEY.');
      }
      if (!wallet.balancePath || !wallet.debitPath) {
        problems.push('WALLET_MODE=http requires WALLET_BALANCE_PATH and WALLET_DEBIT_PATH.');
      }
    } else if (!['disabled', 'http'].includes(wallet.mode)) {
      problems.push(`WALLET_MODE must be 'disabled' or 'http' (got "${wallet.mode}").`);
    }
  }

  if (problems.length) {
    throw new Error(`Invalid production configuration:\n  - ${problems.join('\n  - ')}`);
  }
  return true;
}

module.exports = { config, validateRuntimeConfig };
