/**
 * ============================================================================
 * LOCAL DEMO STACK ORCHESTRATOR  (node scripts/devStack.js)
 * ----------------------------------------------------------------------------
 * Brings up the FULL application locally without any external cloud account:
 *
 *   1. Boots an in-memory MongoDB REPLICA SET (mongodb-memory-server) so the
 *      dev wallet's paid-join transactions are supported (a standalone cannot).
 *   2. Seeds the fictional dev fixtures into it (scripts/seed/seed.dev.js).
 *   3. Starts the Express API pointed at that database (auth=dev-mock,
 *      wallet=dev) and keeps it running.
 *
 * The frontend `vite` dev server then proxies /api to this on :4000.
 *
 * This is a DEMO deployment: it uses dev-mock identity and fictional in-database
 * balances. It is NOT the production stack and needs no secrets or Atlas IP
 * allow-listing. Ctrl+C stops the API, the seed, and the memory database.
 * ========================================================================= */
const { spawn } = require('child_process');
const path = require('path');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const ROOT = path.resolve(__dirname, '..'); // backend/

/** Env shared by the seed + server children. Overrides .env (dotenv never
 *  overwrites an existing process.env value), so the Atlas URI is bypassed. */
function childEnv(uri) {
  return {
    ...process.env,
    NODE_ENV: 'development',
    PORT: process.env.PORT || '4000',
    MONGODB_URI: uri,
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: '15000',
    EXIT_ON_DB_FAILURE: 'false',
    AUTH_MODE: 'dev-mock',
    DEV_JWT_SECRET: 'local-demo-stack-secret',
    DEV_JWT_TTL_SECONDS: '28800',
    WALLET_MODE: 'dev',
    MONGODB_REQUIRE_TRANSACTIONS: 'true',
    DEVICE_HASH_SALT: 'local-demo-stack-salt',
    CORS_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',
    LOG_LEVEL: 'info',
    TRUST_PROXY: '0',
  };
}

/** Run a one-shot child (seed) to completion, inheriting its stdio. */
function runChild(cmd, args, env, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with code ${code}`));
    });
  });
}

async function main() {
  console.log('[devStack] starting in-memory MongoDB replica set (this can take ~30-60s on first launch on Windows)...');
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', launchTimeout: 60000 },
  });
  const uri = replSet.getUri('veloop_project');
  console.log('[devStack] memory MongoDB ready.');

  const env = childEnv(uri);

  // 1) Seed the demo fixtures (force = idempotent reset+seed).
  console.log('[devStack] seeding dev fixtures...');
  await runChild(process.execPath, ['scripts/seed/seed.dev.js', '--force'], env, 'seed:dev');

  // 2) Start the API and keep it alive.
  console.log('[devStack] starting API on port ' + env.PORT + ' ...');
  const api = spawn(process.execPath, ['src/server.js'], { cwd: ROOT, env, stdio: 'inherit' });

  const shutdown = () => {
    console.log('\n[devStack] shutting down...');
    try { api.kill('SIGINT'); } catch (_) {}
    replSet.stop().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 4000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  api.on('close', (code) => {
    console.log(`[devStack] API exited (code ${code}); stopping memory DB.`);
    replSet.stop().then(() => process.exit(code || 0));
  });
}

main().catch((err) => {
  console.error('[devStack] failed:', err.message || err);
  process.exit(1);
});
