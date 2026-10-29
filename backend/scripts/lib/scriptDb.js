/**
 * Shared helpers for the command-line database scripts.
 *
 * Scripts connect with the same configuration the app uses, refuse to run
 * against production data by accident, and always disconnect cleanly so the
 * process exits instead of hanging on an open socket.
 */
const mongoose = require('mongoose');
const { config } = require('../../src/config/index.js');

async function connect() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  await mongoose.connect(config.mongo.uri, {
    serverSelectionTimeoutMS: config.mongo.serverSelectionTimeoutMs,
    maxPoolSize: config.mongo.maxPoolSize,
    autoIndex: !config.isProduction,
  });
  return mongoose.connection;
}

async function disconnect() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

/** Guards that a destructive/dev-only script is not pointed at production. */
function assertNotProduction(what) {
  if (config.isProduction) {
    throw new Error(`${what} refuses to run with NODE_ENV=production. Dev/test databases only.`);
  }
}

/** Fail with a readable line instead of a stack when MongoDB is unreachable. */
function describeConnectionError(err) {
  const code = err && (err.codeName || err.name);
  return `Cannot reach MongoDB at ${redact(config.mongo.uri)} (${code || 'unreachable'}). ` +
    'Start MongoDB (a replica set is required once transactions are used) or set MONGODB_URI.';
}

/** Strip credentials from a connection string before it is ever printed. */
function redact(uri) {
  return String(uri).replace(/\/\/[^@/]*@/, '//***@');
}

module.exports = { connect, disconnect, assertNotProduction, describeConnectionError, redact, mongoose };
