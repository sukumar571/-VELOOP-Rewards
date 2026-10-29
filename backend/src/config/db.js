/**
 * ============================================================================
 * DATABASE — Mongoose connection lifecycle.
 * ============================================================================
 * The connection is owned here and by server.js only; app.js (and therefore the
 * tests) never require a live MongoDB. `bufferCommands` is disabled so that a
 * query attempted while disconnected fails FAST (surfaced as 503) rather than
 * hanging the request. Connection state is reported to /health/ready verbatim —
 * readiness honestly reflects whether the database is reachable.
 * ========================================================================= */
const mongoose = require('mongoose');
const { config } = require('./index.js');
const { logger } = require('./logger.js');

// Fail fast instead of buffering when there is no active connection.
mongoose.set('bufferCommands', false);
// Index auto-building is a dev convenience only; disable it in production.
mongoose.set('autoIndex', !config.isProduction);
mongoose.set('strictQuery', true);

const STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

let listenersRegistered = false;

function registerConnectionListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;
  const conn = mongoose.connection;
  conn.on('connected', () => logger.info('MongoDB connected'));
  conn.on('reconnecting', () => logger.warn('MongoDB reconnecting…'));
  conn.on('disconnected', () => logger.warn('MongoDB disconnected'));
  conn.on('error', (err) => logger.error({ err }, 'MongoDB connection error'));
}

/** Current human-readable connection state (for readiness probes / logs). */
function dbStatus() {
  return STATES[mongoose.connection.readyState] ?? 'unknown';
}

function isConnected() {
  return mongoose.connection.readyState === 1;
}

/**
 * Establish the connection. Throws on failure only when `exitOnFailure` is set
 * (production default), so local development can still boot and serve /health
 * while the database is offline.
 */
async function connectDB({ exitOnFailure = config.server.exitOnDbFailure } = {}) {
  registerConnectionListeners();
  try {
    await mongoose.connect(config.mongo.uri, {
      serverSelectionTimeoutMS: config.mongo.serverSelectionTimeoutMs,
      maxPoolSize: config.mongo.maxPoolSize,
    });
    return mongoose.connection;
  } catch (err) {
    logger.error(
      { err, uri: redactUri(config.mongo.uri) },
      `MongoDB connection failed (state: ${dbStatus()})`,
    );
    if (exitOnFailure) throw err;
    logger.warn('Continuing without a database connection; /health/ready will report it.');
    return null;
  }
}

/** Gracefully close the connection during shutdown. */
async function disconnectDB() {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.connection.close();
  logger.info('MongoDB connection closed');
}

/** Strip credentials from a Mongo URI before logging it. */
function redactUri(uri) {
  try {
    return uri.replace(/\/\/[^@/]+@/, '//[REDACTED]@');
  } catch {
    return '[UNPARSABLE_URI]';
  }
}

module.exports = { connectDB, disconnectDB, dbStatus, isConnected, redactUri };
