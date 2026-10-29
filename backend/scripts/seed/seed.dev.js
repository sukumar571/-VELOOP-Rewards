/**
 * ============================================================================
 * DEVELOPMENT SEED  (npm run seed:dev)  — FICTIONAL DATA ONLY
 * ============================================================================
 * Writes the fixtures from ./fixtures.dev.js into the configured MongoDB.
 *
 *  • Refuses to run with NODE_ENV=production.
 *  • Syncs indexes first, so every unique constraint is actually in force while
 *    the fixtures are inserted (a duplicate participation must fail HERE, not
 *    silently pass).
 *  • Stamps every document with seedBatch = SEED_VERSION so `npm run seed:reset`
 *    can delete exactly these rows and never touch a real record.
 *  • Idempotent: re-running without --force reports "already seeded" and stops.
 *
 * Balance note: wallet snapshots are tagged SEED_FIXTURE. This backend is NOT
 * connected to the real VELOOP wallet, so no fixture may pretend to be a
 * provider-observed balance.
 * ========================================================================= */
const models = require('../../src/models/index.js');
const { SEED_VERSION, buildFixtures, stamp } = require('./fixtures.dev.js');

/** Order matters: referenced documents must exist before their referrers. */
const INSERT_ORDER = [
  ['User', 'users'],
  ['Giveaway', 'giveaways'],
  ['Prize', 'prizes'],
  ['GiveawayParticipation', 'participations'],
  ['GiveawayEntryTransaction', 'transactions'],
  ['GiveawayWinner', 'winners'],
  ['PrizeClaim', 'claims'],
  ['FraudEvent', 'fraudEvents'],
];

async function seedDev({ force = false, log = console.log, runMigrationFn } = {}) {
  const { assertNotProduction, connect, disconnect } = require('../lib/scriptDb.js');
  assertNotProduction('seed:dev');

  await connect();
  const { runMigration } = runMigrationFn ? { runMigration: runMigrationFn } : require('../migrate.js');
  await runMigration({ log: () => {} });

  const already = await models.Giveaway.countDocuments({ seedBatch: SEED_VERSION });
  if (already > 0 && !force) {
    log(`Seed batch ${SEED_VERSION} is already present (${already} giveaway(s)). Re-run with --force to reset and reseed.`);
    await disconnect();
    return { skipped: true, seedVersion: SEED_VERSION };
  }
  if (already > 0 && force) {
    const { resetDev } = require('./reset.dev.js');
    await resetDev({ log: () => {} });
  }

  const fixtures = buildFixtures(new Date());
  const counts = {};

  for (const [modelName, key] of INSERT_ORDER) {
    const Model = models[modelName];
    const rows = stamp(fixtures[key]);
    // insertMany bypasses nothing important here, but document hooks (capacity
    // checks, fulfilment rules) are part of what the seed is meant to prove, so
    // rows go through validate() explicitly.
    const docs = rows.map((row) => new Model(row));
    for (const doc of docs) await doc.validate();
    await Model.insertMany(docs, { ordered: true });
    counts[key] = docs.length;
    log(`seeded ${key}: ${docs.length}`);
  }

  for (const row of stamp(fixtures.walletReferences)) {
    await models.WalletReference.create(row);
  }
  counts.walletReferences = fixtures.walletReferences.length;
  log(`seeded walletReferences: ${counts.walletReferences} (tagged SEED_FIXTURE)`);

  for (const entry of fixtures.auditLogs) {
    await models.AuditLog.record({ ...entry, seedBatch: SEED_VERSION });
  }
  counts.auditLogs = fixtures.auditLogs.length;
  log(`seeded auditLogs: ${counts.auditLogs}`);

  // Denormalized counters on the giveaway are rebuilt from the real rows.
  for (const g of fixtures.giveaways) {
    await models.Giveaway.updateOne(
      { _id: g._id },
      {
        $set: {
          'stats.participationCount': await models.GiveawayParticipation.countDocuments({ giveawayId: g._id }),
          'stats.entryCount': (await models.GiveawayParticipation.find({ giveawayId: g._id }).select('entryCount').lean())
            .reduce((sum, p) => sum + (p.entryCount || 0), 0),
          'stats.winnerCount': await models.GiveawayWinner.countDocuments({ giveawayId: g._id }),
          'stats.recalculatedAt': new Date(),
        },
      },
    );
  }

  log(`Seed batch ${SEED_VERSION} applied.`);
  await disconnect();
  return { skipped: false, seedVersion: SEED_VERSION, counts };
}

module.exports = { seedDev, INSERT_ORDER };

/* istanbul ignore next -- CLI entry point */
if (require.main === module) {
  const { describeConnectionError } = require('../lib/scriptDb.js');
  seedDev({ force: process.argv.includes('--force') })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message && err.message.includes('Mongo') ? describeConnectionError(err) : err.message);
      process.exit(1);
    });
}
