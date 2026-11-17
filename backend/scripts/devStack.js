/**
 * ============================================================================
 * LOCAL DEMO STACK ORCHESTRATOR  (node scripts/devStack.js)
 * ----------------------------------------------------------------------------
 * Brings up the application locally against the MongoDB configured in
 * backend/.env (a real MongoDB Atlas replica set in this deployment):
 *
 *   1. Seeds the dev fixtures into that database (scripts/seed/seed.dev.js
 *      --force, which is idempotent: it only touches `seedBatch`-tagged rows).
 *   2. Starts the Express API pointed at the SAME database, with the local
 *      auth/wallet modes the demo needs.
 *
 * Nothing here boots an in-memory MongoDB any more — every write, including
 * local signup/login (see services/auth.service.js), lands in the Atlas cluster
 * configured by MONGODB_URI. The Atlas project's Network Access allow-list must
 * include this machine's public IP, or the seed/API will fail to connect.
 *
 * The frontend `vite` dev server then proxies /api to this on :4000.
 *
 * Ctrl+C stops the API. It never drops a collection: seeded rows survive the
 * restart and can be removed explicitly with `npm run seed:reset`.
 * ========================================================================= */
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..'); // backend/

/**
 * Reads a single key from backend/.env WITHOUT putting it into process.env.
 * Used only so the "target MongoDB" line below can report the database the
 * children will actually use instead of claiming the URI is unset. The children
 * still load .env themselves; overriding process.env here would also override
 * PORT, which must stay the demo's own value.
 */
function envFileValue(key) {
  try {
    const parsed = require('dotenv').parse(require('fs').readFileSync(path.join(ROOT, '.env')));
    return parsed[key];
  } catch {
    return undefined;
  }
}

/**
 * Env shared by the seed + server children. We deliberately do NOT override
 * MONGODB_URI: dotenv inside `src/config/index.js` reads backend/.env, so the
 * Atlas URI (and its credentials) is what actually connects. Only the demo
 * toggles are forced here so the stack works without any additional setup.
 */
function childEnv() {
  return {
    ...process.env,
    NODE_ENV: 'development',
    // An inherited PORT=0 would make the API bind a random ephemeral port and
    // silently break the frontend's /api proxy, so only a real port is honoured.
    PORT: Number(process.env.PORT) > 0 ? String(process.env.PORT) : '4000',
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || '15000',
    EXIT_ON_DB_FAILURE: 'true', // Atlas is the source of truth; a failure to reach it must be loud.
    AUTH_MODE: 'dev-mock', // local signup/login + dev JWTs signed with DEV_JWT_SECRET
    WALLET_MODE: 'dev', // fictional in-DB balances for the paid-join demo
    MONGODB_REQUIRE_TRANSACTIONS: 'true', // Atlas is a replica set — transactions supported
    CORS_ORIGINS: process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    TRUST_PROXY: process.env.TRUST_PROXY || '0',
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
  const env = childEnv();
  // Redact credentials before printing so an operator can see WHICH Atlas
  // database is about to receive the fixtures without leaking them to a shell
  // history or a screenshot.
  const displayUri = String(env.MONGODB_URI || envFileValue('MONGODB_URI') || '')
    .replace(/\/\/[^@/]+@/, '//[REDACTED]@')
    || '(unset — copy backend/.env.example to backend/.env first)';
  console.log(`[devStack] target MongoDB: ${displayUri}`);

  console.log('[devStack] seeding dev fixtures (idempotent, seedBatch-tagged rows only)…');
  await runChild(process.execPath, ['scripts/seed/seed.dev.js', '--force'], env, 'seed:dev');

  console.log('[devStack] starting API on port ' + env.PORT + ' …');
  const api = spawn(process.execPath, ['src/server.js'], { cwd: ROOT, env, stdio: 'inherit' });

  const shutdown = () => {
    console.log('\n[devStack] shutting down API…');
    try { api.kill('SIGINT'); } catch (_) {}
    setTimeout(() => process.exit(0), 4000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  api.on('close', (code) => {
    console.log(`[devStack] API exited (code ${code}).`);
    process.exit(code || 0);
  });
}

main().catch((err) => {
  console.error('[devStack] failed:', err.message || err);
  process.exit(1);
});
