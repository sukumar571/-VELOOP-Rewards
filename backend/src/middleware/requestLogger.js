/**
 * requestLogger — structured per-request logging (pino-http) + request IDs.
 *
 * Every request gets a UUID that is: stored on req.id, echoed as the X-Request-Id
 * response header, and included by the error handler in error bodies so an issue
 * can be traced from the client to the logs. Sensitive fields are scrubbed by the
 * logger's central redaction config, not here.
 */
const crypto = require('crypto');
const pinoHttp = require('pino-http');
const { logger } = require('../config/logger.js');

const httpLoggerFactory = pinoHttp.default || pinoHttp;

const requestLogger = httpLoggerFactory({
  logger,
  genReqId(req, res) {
    // Reuse an inbound, validated request id if a trusted proxy supplied one.
    const inbound = req.headers['x-request-id'];
    const id =
      typeof inbound === 'string' && /^[\w-]{8,64}$/.test(inbound)
        ? inbound
        : crypto.randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  customProps(req) {
    return { requestId: req.id };
  },
  autoLogging: {
    // Don't spam logs with health-probe noise.
    ignore: (req) => req.url === '/health' || req.url === '/health/ready',
  },
  customLogLevel(req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
      };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
});

module.exports = { requestLogger };
