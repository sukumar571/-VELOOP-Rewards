/**
 * ============================================================================
 * LOGGER — structured JSON logging (pino) with sensitive-data redaction.
 * ============================================================================
 * Redaction is enforced centrally via the `redact` paths from config so auth
 * headers, cookies and credential/PII fields never reach log sinks. In
 * development the output is prettified; elsewhere it is machine-readable JSON.
 * Tests can build a logger over an in-memory stream to assert redaction.
 * ========================================================================= */
const pino = require('pino');
const { config } = require('./index.js');

const PRETTY_LEVELS = new Set(['development']);

/**
 * Build a pino logger. `overrides` lets tests inject a custom destination and
 * level without touching process-wide state.
 */
function createLogger(overrides = {}) {
  const { destination, ...rest } = overrides;
  const level = rest.level || config.logging.level || 'info';
  const opts = {
    level,
    redact: { paths: config.logging.redact, censor: '[REDACTED]' },
    base: { env: config.env },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Never serialize a stack trace to the client; keep it internal only.
    formatters: {
      level: (label) => ({ level: label }),
    },
    ...rest,
  };

  // Human-friendly transport for local development only, and only when a custom
  // destination/stream was not supplied (tests always supply one or use silent).
  if (PRETTY_LEVELS.has(config.env) && !opts.transport && !destination) {
    opts.transport = { target: 'pino-pretty', options: { colorize: true } };
  }

  return destination ? pino(opts, destination) : pino(opts);
}

const logger = createLogger();

module.exports = { logger, createLogger };
module.exports.default = logger;
