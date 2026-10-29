/**
 * ============================================================================
 * DEVELOPMENT SEED RESET  (npm run seed:reset)
 * ============================================================================
 * Removes ONLY the documents written by the dev seed, identified by
 * `seedBatch = SEED_VERSION`. Real records have seedBatch = null and are
 * therefore unreachable by this script.
 *
 * The models deliberately refuse hard deletes (history protection), so the reset
 * passes { overrideHistoryGuard: true } — the one escape hatch, reserved for
 * this dev-only path and blocked entirely when NODE_ENV=production.
 *
 * Order is child-first so nothing is left dangling if the run is interrupted.
 */
const models = require('../../src/models/index.js');
const { SEED_VERSION } = require('./fixtures.dev.js');

const RESET_ORDER = [
  'PrizeClaim',
  'GiveawayWinner',
  'GiveawayEntryTransaction',
  'GiveawayParticipation',
  'FraudEvent',
  'WalletReference',
  'Prize',
  'Giveaway',
  'AuditLog',
  'User',
];

async function resetDev({ log = console.log, keepUsers = false } = {}) {
  const { assertNotProduction, connect, disconnect } = require('../lib/scriptDb.js');
  assertNotProduction('seed:reset');

  await connect();
  const filter = { seedBatch: SEED_VERSION };
  const opts = { overrideHistoryGuard: true };
  const removed = {};

  for (const name of RESET_ORDER) {
    if (keepUsers && name === 'User') continue;
    const res = await models[name].deleteMany(filter, opts);
    removed[name] = res.deletedCount;
    log(`removed ${name}: ${res.deletedCount}`);
  }

  log(`Reset of seed batch ${SEED_VERSION} complete.`);
  await disconnect();
  return { seedVersion: SEED_VERSION, removed };
}

module.exports = { resetDev, RESET_ORDER };

/* istanbul ignore next -- CLI entry point */
if (require.main === module) {
  const { describeConnectionError } = require('../lib/scriptDb.js');
  resetDev({ keepUsers: process.argv.includes('--keep-users') })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message && err.message.includes('Mongo') ? describeConnectionError(err) : err.message);
      process.exit(1);
    });
}
