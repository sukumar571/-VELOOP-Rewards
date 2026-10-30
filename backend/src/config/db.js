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
  conn.on('connected', () => {
    transactionSupportCache = null; // a new topology must be re-probed
    logger.info('MongoDB connected');
  });
  conn.on('reconnecting', () => logger.warn('MongoDB reconnecting…'));
  conn.on('disconnected', () => {
    transactionSupportCache = null;
    logger.warn('MongoDB disconnected');
  });
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

// ---------------------------------------------------------------------------
// Transactions — capability probe + safe runner.
// ---------------------------------------------------------------------------
// null = not probed yet for this connection; true/false = cached verdict.
let transactionSupportCache = null;

/**
 * Whether the connected MongoDB deployment can actually run multi-document
 * transactions (a replica set or a sharded cluster via mongos). A standalone
 * server accepts `startSession()` but rejects the FIRST operation that carries a
 * transaction number, so the only honest probe is to run a trivial statement
 * inside a throwaway transaction. The result is cached per connection and reset
 * on connect/disconnect (see registerConnectionListeners).
 */
async function supportsTransactions() {
  if (transactionSupportCache !== null) return transactionSupportCache;
  if (mongoose.connection.readyState !== 1) return false; // unknown while offline; do not cache
  const session = await mongoose.connection.startSession();
  try {
    await session.withTransaction(async () => {
      // A find against a non-existent collection still carries the transaction
      // number, which is exactly what makes a standalone reject it.
      await mongoose.connection.db.collection('__veloop_txn_probe__').findOne({}, { session });
    });
    transactionSupportCache = true;
  } catch (err) {
    const code = err && (err.codeName || err.code);
    const msg = String((err && err.message) || '');
    if (code === 20 || code === 'IllegalOperation'
      || /Transaction numbers are only allowed|replica set member or mongos|Transaction operations are supported only|not supported by storage engine|IllegalOperation/i.test(msg)) {
      transactionSupportCache = false;
    } else {
      // An unexpected failure must NOT be cached as a verdict; fail closed for this
      // call only, so a transient error cannot permanently disable paid entries.
      logger.warn({ err }, 'Transaction capability probe failed; treating this request as unsupported');
      return false;
    }
  } finally {
    await session.endSession();
  }
  return transactionSupportCache;
}

/** Test seam: forget the cached verdict so the next probe re-reads the topology. */
function resetTransactionCapabilityCache() {
  transactionSupportCache = null;
}

/**
 * Runs `workFn(session)` inside ONE MongoDB transaction and returns its result.
 * `withTransaction` commits on success and aborts + rethrows on any error, so a
 * failure anywhere in the callback leaves no partial write behind. Throws if the
 * deployment does not support transactions — callers must probe first and fail
 * closed rather than falling back to unsafe sequential writes.
 */
async function withTransaction(workFn, opts = {}) {
  if (mongoose.connection.readyState !== 1) {
    const err = new Error('DATABASE_UNAVAILABLE');
    err.code = 'DATABASE_UNAVAILABLE';
    throw err;
  }
  const session = await mongoose.connection.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await workFn(session);
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
      ...opts,
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  connectDB,
  disconnectDB,
  dbStatus,
  isConnected,
  redactUri,
  supportsTransactions,
  withTransaction,
  resetTransactionCapabilityCache,
};
