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

/** Build a limiter; `overrides` lets callers/tests tune window & max. */
function createLimiter(overrides = {}) {
  return factory({
    windowMs: overrides.windowMs ?? config.security.rateLimit.windowMs,
    limit: overrides.limit ?? config.security.rateLimit.max,
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    keyGenerator: overrides.keyGenerator ?? keyGenerator,
    handler: overrides.handler ?? respond,
    // Health checks must never be throttled away.
    skip: overrides.skip ?? ((req) => req.url === '/health' || req.url === '/health/ready'),
  });
}

const globalLimiter = createLimiter();
const authLimiter = createLimiter({ limit: config.security.rateLimit.authMax });

module.exports = { createLimiter, globalLimiter, authLimiter };
