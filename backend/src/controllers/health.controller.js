/**
 * health.controller — liveness & readiness, reported honestly.
 *
 *   • /health (liveness): the process is up and serving traffic.
 *   • /health/ready (readiness): additionally reflects the real MongoDB state.
 *     If the database is unreachable this returns 503 'degraded' — it never
 *     reports success while a dependency is down.
 */
const { dbStatus, isConnected } = require('../config/db.js');
const pkg = require('../../package.json');

function liveness(req, res) {
  return res.status(200).json({
    status: 'ok',
    service: pkg.name,
    version: pkg.version,
    environment: process.env.NODE_ENV || 'development',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}

function readiness(req, res) {
  const ready = isConnected();
  return res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'degraded',
    dependencies: { database: dbStatus() },
    timestamp: new Date().toISOString(),
  });
}

module.exports = { liveness, readiness };
