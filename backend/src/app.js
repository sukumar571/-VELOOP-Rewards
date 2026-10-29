/**
 * ============================================================================
 * EXPRESS APP — fully assembled, dependency-free to import (used by server.js
 * and by tests via supertest). It performs NO I/O at import time: no database
 * connection, no listening. That lives in server.js so tests can exercise the
 * whole request pipeline (security → logging → limits → validation → auth →
 * routes → error handling) without a running MongoDB.
 * ========================================================================= */
const express = require('express');

const { config } = require('./config/index.js');
const { requestLogger } = require('./middleware/requestLogger.js');
const { applySecurity } = require('./middleware/security.js');
const { globalLimiter } = require('./middleware/rateLimiter.js');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler.js');
const healthRoutes = require('./routes/health.routes.js');
const apiV1 = require('./routes/v1/index.js');

const app = express();

// Do not advertise the server technology.
app.disable('x-powered-by');
// Trust is OFF unless explicitly configured, to avoid IP spoofing for rate limits.
app.set('trust proxy', config.server.trustProxy);

// 1) Request id + structured logging (first, so every later step can use req.log/req.id).
app.use(requestLogger);

// 2) Security headers + restricted CORS.
applySecurity(app);

// 3) Health/liveness/readiness BEFORE parsing bodies and rate limiting — probes
//    must stay cheap and must never be throttled.
app.use('/health', healthRoutes);

// 4) Body parsing with an explicit payload-size limit.
app.use(
  express.json({ limit: config.security.jsonBodyLimit }),
);
app.use(
  express.urlencoded({ extended: false, limit: config.security.jsonBodyLimit }),
);

// 5) Global rate limiting for everything below.
app.use(globalLimiter);

// 6) Versioned API.
app.use('/api/v1', apiV1);

// 7) 404 + centralized error handling (must be last).
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
