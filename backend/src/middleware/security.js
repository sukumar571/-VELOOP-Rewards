/**
 * security — HTTP security headers (helmet) + restricted CORS (explicit allow-list).
 *
 * CORS is deny-by-default: a request is granted a cross-origin response only if
 * its Origin exactly matches the configured allow-list (or if it has no Origin,
 * e.g. curl / mobile native / same-origin). Wildcard '*' is supported but then
 * credentials are disabled, per the Fetch spec.
 */
const helmet = require('helmet');
const cors = require('cors');
const { config } = require('../config/index.js');

/**
 * An Origin is scheme + host + port ONLY — it never carries a path or a trailing
 * slash. Operators pasting `CORS_ORIGINS` from a browser address bar routinely
 * include one (`https://app.example/`), and an exact string compare against the
 * browser-sent `https://app.example` then silently rejects EVERY request from
 * the deployed SPA. Normalizing both sides makes that harmless formatting
 * difference impossible to trip over while keeping the allow-list exact.
 */
function normalizeOrigin(value) {
  return String(value === undefined || value === null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '');
}

function buildCorsOptions() {
  const allowList = new Set(
    (config.security.corsOrigins || []).map(normalizeOrigin).filter(Boolean),
  );
  const wildcard = allowList.has('*');

  return {
    credentials: !wildcard,
    origin(origin, callback) {
      // Non-browser clients (no Origin header) are allowed.
      if (!origin) return callback(null, true);
      if (wildcard) return callback(null, true);
      if (allowList.has(normalizeOrigin(origin))) return callback(null, true);
      // Unknown origin: do not set CORS headers; the browser blocks the read.
      return callback(null, false);
    },
    // Only expose headers the SPA legitimately needs to read.
    exposedHeaders: ['X-Request-Id', 'Retry-After', 'RateLimit-Limit', 'RateLimit-Remaining'],
  };
}

function applySecurity(app) {
  app.use(
    helmet({
      // This is a JSON API; a CSP is not required to render responses and can
      // complicate tooling. Enable it if the app ever serves HTML.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cors(buildCorsOptions()));
}

module.exports = { applySecurity, buildCorsOptions, normalizeOrigin };
