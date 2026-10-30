/**
 * rateLimiter — request throttling with a stable 429 error contract.
 *
 * Global limit protects the whole API; a tighter limit guards auth-sensitive
 * routes. The key is the authenticated subject when present (so limits follow a
 * user across IPs) and falls back to the client IP otherwise. Store defaults to
 * in-memory; a Redis/Mongo store is the documented upgrade path for multi-instance
 * deployments (see README / plan G3) — the interface is unchanged when swapped.
 */
const rateLimit = require('express-rate-limit');
const { config } = require('../config/index.js');
const fraud = require('../services/fraud.service.js');

const factory = rateLimit.default || rateLimit;

function keyGenerator(req) {
  return req.auth && req.auth.sub ? `user:${req.auth.sub}` : `ip:${req.ip}`;
}

function respond(req, res) {
  res.status(429).json({
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please slow down and retry later.',
    },
    requestId: req.id,
  });
}

/**
 * The 429 response is identical for every tier, but on the SENSITIVE tiers a burst
 * is also a (non-blocking) fraud signal for the review queue. Recording is
 * fire-and-forget and best-effort — it must never change the client's outcome.
 */
function respondAndSignal(req, res) {
  respond(req, res);
  Promise.resolve(fraud.assessNonBlocking({
    surface: 'rate_limit',
    userId: (req.auth && req.auth.userId) || null,
    requestId: req.id,
  })).catch(() => null);
}

/** Build a limiter; `overrides` lets callers/tests tune window & max. */
function createLimiter(overrides = {}) {
  return factory({
    windowMs: overrides.windowMs ?? config.security.rateLimit.windowMs,
    limit: overrides.limit ?? config.security.rateLimit.max,
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    keyGenerator: overrides.keyGenerator ?? keyGenerator,
    handler: overrides.handler ?? respond,
    // Health probes are never throttled. Under the test environment the mounted
    // app limiters stand down (the integration suites hammer these routes far past
    // production budgets); enforcement itself is proven by the dedicated
    // rateLimiter test, which passes its own `skip: () => false`.
    skip: overrides.skip ?? ((req) => process.env.NODE_ENV === 'test' || req.url === '/health' || req.url === '/health/ready'),
  });
}

const globalLimiter = createLimiter();
const authLimiter = createLimiter({ limit: config.security.rateLimit.authMax, handler: respondAndSignal });
// Entry writes move money, so they get their own budget. Authenticated requests
// are keyed by subject (see keyGenerator), so one user cannot multiply their
// quota by switching networks.
const entryLimiter = createLimiter({ limit: config.security.rateLimit.entryMax, handler: respondAndSignal });
// Claim submission and sensitive admin writes get dedicated, generous budgets.
const claimLimiter = createLimiter({ limit: config.security.rateLimit.claimMax, handler: respondAndSignal });
const adminLimiter = createLimiter({ limit: config.security.rateLimit.adminMax, handler: respondAndSignal });

module.exports = { createLimiter, respondAndSignal, globalLimiter, authLimiter, entryLimiter, claimLimiter, adminLimiter };
