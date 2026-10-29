/**
 * ============================================================================
 * SERVER — process entry point. Owns all startup I/O and lifecycle:
 *   1. Fail-fast configuration validation (esp. production secrets/auth mode).
 *   2. Database connection (handled gracefully if the DB is unreachable).
 *   3. HTTP listen.
 *   4. Graceful shutdown on SIGINT/SIGTERM and fatal error handlers.
 * Importing this file only starts the server when run directly, so tests can
 * import app.js without binding a port or touching the network.
 * ========================================================================= */
const { config, validateRuntimeConfig } = require('./config/index.js');
const { logger } = require('./config/logger.js');
const { connectDB, disconnectDB, dbStatus } = require('./config/db.js');
const app = require('./app.js');

let server;
let shuttingDown = false;

async function start() {
  // 1) Configuration gate. In production this throws if secrets/auth are wrong.
  try {
    validateRuntimeConfig();
  } catch (err) {
    logger.fatal({ err }, 'Startup aborted: invalid configuration');
    process.exit(1);
  }

  // 2) Database. Continues on failure in dev (readiness will report it); in
  //    production exitOnDbFailure defaults to true so connectDB throws.
  try {
    await connectDB();
  } catch (err) {
    logger.fatal({ err }, 'Startup aborted: database connection failed');
    process.exit(1);
  }

  // 3) HTTP.
  server = app.listen(config.server.port, () => {
    logger.info(
      {
        port: config.server.port,
        env: config.env,
        authMode: config.auth.mode,
        database: dbStatus(),
      },
      `VELOOP Giveaway API listening (auth=${config.auth.mode}, db=${dbStatus()})`,
    );
  });

  server.on('error', (err) => {
    logger.fatal({ err }, 'HTTP server error');
    process.exit(1);
  });
}

/**
 * 4) Graceful shutdown: stop accepting new connections, drain in-flight ones,
 *    close the DB, then exit. A watchdog forces exit if draining hangs.
 */
async function shutdown(reason, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ reason }, 'Shutting down…');

  const watchdog = setTimeout(() => {
    logger.error('Graceful shutdown timed out; forcing exit.');
    process.exit(1);
  }, config.server.gracefulTimeoutMs);
  watchdog.unref();

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      // Node 18.2+: terminate keep-alive connections so close() can finish.
      if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    }
    await disconnectDB();
    clearTimeout(watchdog);
    logger.info('Shutdown complete.');
    process.exit(exitCode);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

// Keep the process alive on transient rejections but record them; only truly
// unexpected synchronous throws in an event loop are treated as fatal.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — shutting down');
  shutdown('uncaughtException', 1);
});
['SIGINT', 'SIGTERM'].forEach((signal) =>
  process.on(signal, () => shutdown(signal, 0)),
);

if (require.main === module) {
  start().catch((err) => {
    logger.fatal({ err }, 'Startup failed');
    process.exit(1);
  });
}

module.exports = { start, shutdown };
