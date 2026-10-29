/**
 * ============================================================================
 * DATABASE MIGRATION RUNNER  (npm run db:migrate [-- --dry-run|--check])
 * ============================================================================
 * This project's "migration" is index + policy synchronisation, which is the
 * safe, idempotent operation Mongoose/MongoDB needs:
 *
 *   1. `syncIndexes()` per model — creates declared indexes and drops indexes
 *      that exist in the database but are no longer declared.
 *   2. Optional retention policy for FraudEvent (FRAUD_RETENTION_DAYS).
 *
 * It never rewrites or deletes business data. The one exception is disclosure-
 * worthy: when `FRAUD_RETENTION_DAYS` is set, the retention step also backfills
 * the otherwise-unused `FraudEvent.expiresAt` field on aged rows (idempotent,
 * monotonic, touches no signal data) so the TTL has something to expire. Without
 * that stamp the TTL index would exist but never remove anything. `--check` and
 * `--dry-run` change nothing at all.
 *
 * Schema-changing data migrations (renames, backfills) would live in
 * scripts/migrations/NNN-name.js, applied in order and recorded in a
 * `schemaMigrations` collection. None are needed for this model set yet.
 * ========================================================================= */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const models = require('../src/models/index.js');
const { config } = require('../src/config/index.js');

/**
 * A TEXT index is stored by MongoDB as `{ _fts: 'text', _ftsx: 1 }` plus a
 * `weights` document, while the schema declares the weighted fields. Normalize both
 * sides to the same sorted field list so the comparison is about the index itself.
 */
function normalizeIndexKey({ key, weights }) {
  const entries = Object.entries(key || {});
  const isText = entries.some(([, v]) => v === 'text') || entries.some(([k]) => k === '_fts');
  if (isText) {
    const fields = entries.some(([k]) => k === '_fts') ? Object.keys(weights || {}) : entries.map(([k]) => k);
    return ['text', fields.slice().sort()];
  }
  return entries.filter(([k]) => k !== '_fts' && k !== '_ftsx').map(([k, v]) => [k, typeof v === 'number' ? v : String(v)]);
}

/**
 * Compares a DECLARED index with a REAL one. The `name` is intentionally not part
 * of the fingerprint: Mongoose auto-names declared indexes `field_1_field2_1`, a
 * caller may give one an explicit name, and MongoDB always reports the stored name.
 * What has to agree is the semantics — keys, uniqueness, partial filter, TTL.
 */
function indexFingerprint(index) {
  return JSON.stringify({
    key: normalizeIndexKey(index),
    unique: Boolean(index.unique),
    partial: index.partialFilterExpression || null,
    ttl: typeof index.expireAfterSeconds === 'number' ? index.expireAfterSeconds : null,
  });
}

/**
 * `listIndexes` fails with NamespaceNotFound on a collection that has never been
 * written to, which is the normal state of a brand-new database. An empty list is
 * the honest answer; `--check` must not crash before it can report anything.
 */
async function realIndexes(collection) {
  try {
    return (await collection.indexes()).filter((i) => i.name !== '_id_');
  } catch (err) {
    if (err && (err.codeName === 'NamespaceNotFound' || err.code === 26)) return [];
    throw err;
  }
}

function declaredIndexes(Model) {
  return Model.schema
    .indexes()
    .map(([key, options = {}]) => ({ key, ...options }))
    .filter((i) => Object.keys(i.key).length);
}

/**
 * @param {{dryRun?:boolean, checkOnly?:boolean, log?:Function}} opts
 * @returns {Promise<{created:number,dropped:number,verified:number,retention:Object|null,report:Array}>}
 */
async function runMigration({ dryRun = false, checkOnly = false, log = console.log } = {}) {
  const report = [];
  let created = 0;
  let dropped = 0;
  let verified = 0;
  let retention = null;

  for (const [name, Model] of Object.entries(models)) {
    const wanted = declaredIndexes(Model);

    if (dryRun) {
      report.push({ model: name, mode: 'dry-run', declared: wanted.length });
      log(`[dry-run] ${name}: ${wanted.length} index(es) declared`);
      continue;
    }

    const collection = Model.collection;
    const existing = await realIndexes(collection);

    if (checkOnly) {
      const existingSet = new Set(existing.map(indexFingerprint));
      const missing = wanted.filter((i) => !existingSet.has(indexFingerprint(i)));
      report.push({ model: name, mode: 'check', declared: wanted.length, actual: existing.length, missing: missing.length });
      log(`[check] ${name}: declared=${wanted.length} actual=${existing.length} missing=${missing.length}`);
      verified += missing.length === 0 ? 1 : 0;
      continue;
    }

    const before = existing.length;
    await Model.syncIndexes(); // creates missing, drops no-longer-declared
    const after = (await realIndexes(collection)).length;
    created += Math.max(0, after - before);
    dropped += Math.max(0, before - after);
    report.push({ model: name, mode: 'sync', declared: wanted.length, before, after });
    log(`[sync] ${name}: indexes ${before} -> ${after} (declared ${wanted.length})`);
  }

  // Retention is opt-in policy, never a surprise default.
  const retentionDays = Number.parseInt(process.env.FRAUD_RETENTION_DAYS || '', 10);
  if (!dryRun && !checkOnly && Number.isInteger(retentionDays) && retentionDays > 0) {
    const policy = await models.FraudEvent.applyRetention(retentionDays);
    retention = policy;
    log(
      `[policy] FraudEvent retention: TTL index ${policy.indexed ? 'ensured' : 'absent'}, ` +
        `${policy.stamped} aged row(s) stamped with expiresAt, expiring ${policy.days} day(s) later`,
    );
  } else if (Number.isInteger(retentionDays) && retentionDays > 0) {
    log(`[policy] FRAUD_RETENTION_DAYS=${retentionDays} would be applied without --dry-run`);
  }

  return { created, dropped, verified, retention, report };
}

module.exports = { runMigration, indexFingerprint, declaredIndexes };

/* istanbul ignore next -- CLI entry point */
if (require.main === module) {
  const argv = process.argv.slice(2);
  const { connect, disconnect, describeConnectionError } = require('./lib/scriptDb.js');

  (async () => {
    const opts = { dryRun: argv.includes('--dry-run'), checkOnly: argv.includes('--check') };
    try {
      console.log(`Migrating ${require('./lib/scriptDb.js').redact(config.mongo.uri)}${opts.dryRun ? ' (dry run)' : ''}${opts.checkOnly ? ' (check only)' : ''}`);
      if (!opts.dryRun) await connect();
      const result = await runMigration(opts);
      console.log(
        `Done: ${result.created} created, ${result.dropped} dropped, ${result.report.length} model(s) handled.`,
      );
      if (opts.checkOnly) {
        const drifted = result.report.filter((r) => r.missing > 0);
        if (drifted.length) {
          console.error(`Drift: ${drifted.length} model(s) miss declared indexes: ${drifted.map((r) => `${r.model}(${r.missing})`).join(', ')}`);
          console.error('Run `npm run db:migrate` to synchronise.');
        }
      }
      if (!opts.dryRun) await disconnect();
      // A check that finds drift must fail, so CI can gate on it.
      process.exitCode = opts.checkOnly && result.report.some((r) => r.missing > 0) ? 1 : 0;
    } catch (err) {
      console.error(describeConnectionError(err));
      console.error(err.message);
      process.exitCode = 1;
    }
  })();
}
