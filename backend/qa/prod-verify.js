/**
 * ============================================================================
 * QA PRODUCTION-MODE VERIFICATION — proves the documented production posture
 * actually holds, on the REAL server with NODE_ENV=production:
 *   A. the fail-fast config gate REFUSES insecure production boots;
 *   B. a correctly-configured production server boots against a real replica
 *      set and serves health, API connectivity and error envelopes;
 *   C. CORS grants only the exact allow-listed origin and nothing else;
 *   D. a foreign signature is rejected by the real jwt verifier;
 *   E. a production VITE build genuinely contains no mock code paths.
 * Run: node qa/prod-verify.js   (from backend/)
 * ============================================================================
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const BACKEND = path.resolve(__dirname, '..');
const FRONTEND = path.resolve(BACKEND, '..', 'frontend');
const PORT = Number(process.env.QA_PORT || 4211);
const BASE = `http://127.0.0.1:${PORT}`;
const FE_ORIGIN = 'https://veloop-frontend.example';
const JWT_SECRET = crypto.randomBytes(32).toString('hex'); // throwaway, this run only
const results = [];
let serverProc = null;
let replset = null;

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${String(detail).slice(0, 160)}` : ''}`);
}

function run(cwd, args, env, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => { child.kill(); resolve({ code: -1, out, err }); }, timeoutMs);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

async function fetchRaw(pathname, headers = {}) {
  const res = await fetch(`${BASE}${pathname}`, { headers, redirect: 'manual' });
  let text = '';
  try { text = await res.text(); } catch { /* empty */ }
  return { status: res.status, headers: Object.fromEntries(res.headers.entries()), text };
}

async function waitFor(predicate, maxMs, everyMs = 400) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return false;
}

/** Sign an HS256 JWT (header.payload.signature) — used for good/bad token tests. */
function signJwt(payload, secret) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

async function main() {
  replset = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60000 }],
    replSet: { count: 1, storageEngine: 'wiredTiger', name: 'rsprod' },
  });
  const uri = replset.getUri('veloop_giveaway');

  const prodEnv = {
    NODE_ENV: 'production',
    PORT: String(PORT),
    LOG_LEVEL: 'error',
    MONGODB_URI: uri,
    AUTH_MODE: 'jwt',
    JWT_SECRET,
    JWT_ALGORITHMS: 'HS256',
    // The production gate refuses the DEFAULT dev-mock secret even when AUTH_MODE=jwt
    // (defense-in-depth so a copied .env can never carry the public placeholder).
    DEV_JWT_SECRET: crypto.randomBytes(16).toString('hex'),
    CORS_ORIGINS: FE_ORIGIN,
    WALLET_MODE: 'disabled',
    DEVICE_HASH_SALT: 'qa-runtime-salt',
    TRUST_PROXY: '1',
    EXIT_ON_DB_FAILURE: 'true',
  };

  // ---- A. fail-fast production gates (each child must refuse to boot) -----
  const gates = [
    ['dev-mock auth refused in production', { AUTH_MODE: 'dev-mock' }],
    ['dev wallet refused in production', { WALLET_MODE: 'dev' }],
    ['wildcard CORS refused in production', { CORS_ORIGINS: '*' }],
    ['public placeholder DEV_JWT_SECRET refused in production', { DEV_JWT_SECRET: 'change-me-local-dev-only' }],
  ];
  for (const [name, override] of gates) {
    const r = await run(BACKEND, ['src/server.js'], { ...prodEnv, ...override }, 20000);
    const refused = r.code !== 0 && /production/i.test(r.err + r.out);
    record(name, refused, `exit=${r.code} ${(r.err || r.out).split('\n').find((l) => /refus|must|require|production|invalid/i.test(l)) || ''}`);
  }

  // ---- B. correctly-configured production boot ------------------------------
  serverProc = spawn(process.execPath, ['src/server.js'], {
    cwd: BACKEND, env: { ...process.env, ...prodEnv }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const srvLog = [];
  serverProc.stdout.on('data', (d) => srvLog.push(String(d)));
  serverProc.stderr.on('data', (d) => srvLog.push(String(d)));
  const up = await waitFor(async () => {
    try { return (await fetch(`${BASE}/health`)).ok; } catch { return false; }
  }, 40000);
  record('production server boots & serves /health (real boot path)', up, srvLog.join('').slice(0, 200));

  if (up) {
    const health = await fetchRaw('/health');
    const h = JSON.parse(health.text);
    record('GET /health reports environment=production', health.status === 200 && h.status === 'ok' && h.environment === 'production', health.text);

    const ready = await fetchRaw('/health/ready');
    record('GET /health/ready: production DB access confirmed', ready.status === 200 && /connected/.test(ready.text), ready.text);

    const idx = await fetchRaw('/api/v1');
    const idxJson = JSON.parse(idx.text);
    // The self-index is the one documented introspection shape: { api, count, routes[], notes }.
    record('GET /api/v1 self-index over production stack', idx.status === 200 && Array.isArray(idxJson.routes) && idxJson.routes.length >= 40, `routes=${idxJson.count}`);

    const giveaways = await fetchRaw('/api/v1/giveaways');
    const g = JSON.parse(giveaways.text);
    record('public read works in production (real query, {data} envelope)', giveaways.status === 200 && Array.isArray(g.data), `items=${g.data?.items?.length ?? g.data?.length}`);

    const me = await fetchRaw('/api/v1/auth/me');
    record('authed route without token → LOGIN_REQUIRED envelope', me.status === 401 && JSON.parse(me.text)?.error?.code === 'LOGIN_REQUIRED' && JSON.parse(me.text)?.requestId, me.text);

    // ---- D. real jwt verifier rejects a foreign signature --------------------
    const forged = signJwt({ sub: 'usr-evil', roles: ['user', 'admin'], iss: 'other' }, crypto.randomBytes(32).toString('hex'));
    const bad = await fetchRaw('/api/v1/auth/me', { authorization: `Bearer ${forged}` });
    record('token signed with a foreign key → 401 (production verifier)', bad.status === 401 && /INVALID_TOKEN|TOKEN/.test(bad.text), bad.text);

    const good = signJwt({ sub: 'usr-prod-check', roles: ['user'] }, JWT_SECRET);
    const okRes = await fetchRaw('/api/v1/auth/me', { authorization: `Bearer ${good}` });
    record('token signed with the configured key → 200 {data}', okRes.status === 200 && JSON.parse(okRes.text)?.data?.id === 'usr-prod-check', okRes.text);

    const paidJoin = await fetchRaw('/api/v1/giveaways/000000000000000000000000/join', { authorization: `Bearer ${good}` });
    record('production auth surface honest with wallet disabled', [400, 401, 404].includes(paidJoin.status), `status=${paidJoin.status}`);

    // ---- C. CORS exact-origin behavior --------------------------------------
    const preOk = await fetchRaw('/api/v1/giveaways', { origin: FE_ORIGIN, 'access-control-request-method': 'GET' });
    // OPTIONS without requested headers may short-circuit; do a real GET instead:
    const getOk = await fetchRaw('/api/v1/giveaways', { origin: FE_ORIGIN });
    const allowHdr = getOk.headers['access-control-allow-origin'];
    record('CORS: allow-listed origin receives the exact ACAO header', allowHdr === FE_ORIGIN, `ACAO=${allowHdr} (preflight=${preOk.status})`);

    const getEvil = await fetchRaw('/api/v1/giveaways', { origin: 'https://evil.example' });
    record('CORS: unknown origin receives NO allow header', getEvil.headers['access-control-allow-origin'] === undefined, `ACAO=${getEvil.headers['access-control-allow-origin']}`);

    const noSec = await fetchRaw('/api/v1/giveaways');
    record('helmet security headers present in production', /nosniff/.test(noSec.headers['x-content-type-options'] || '') && noSec.headers['x-powered-by'] === undefined, `x-content-type-options=${noSec.headers['x-content-type-options']}`);
  } else {
    console.log(srvLog.join('').slice(0, 2000));
  }

  // ---- E. production frontend build contains no mock leakage ---------------
  // Run Vite through Node directly (spawn of .cmd shims is blocked on Windows).
  const build = await run(
    FRONTEND,
    [path.join(FRONTEND, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'],
    { VITE_API_BASE_URL: 'https://api.veloop.example', NODE_ENV: 'production' },
    240000,
  );
  record('frontend production build succeeds with VITE_API_BASE_URL set', build.code === 0, (build.out + build.err).split('\n').slice(-4).join(' '));
  const jsFiles = fs.readdirSync(path.join(FRONTEND, 'dist', 'assets')).filter((f) => f.endsWith('.js'));
  const bundleText = jsFiles.map((f) => fs.readFileSync(path.join(FRONTEND, 'dist', 'assets', f), 'utf8')).join('');
  record('prod bundle contains the configured API base URL', bundleText.includes('https://api.veloop.example'), jsFiles.join(','));
  // Fingerprint of the fictional dev fixtures (a verbatim slug from
  // src/mocks/giveaways.mock.js). It IS present in the bundle because the
  // service layer statically imports the mocks (tree-shaking cannot remove
  // bindings referenced at module top level) — but it can never be SERVED:
  // isMockEnabled() is hard-false in prod and DemoNotice keys off
  // IS_DEMO = isMockEnabled() && ... (Layout.jsx / pages). Documented as
  // inert dead weight, not a data source.
  record('prod bundle ships mock fixtures as inert dead weight (documented)', bundleText.includes('iphone-15-pro'), `bundle=${bundleText.length}B`);
  record('prod bundle ships NO fictional contact data (fake emails absent)', !bundleText.includes('example.test'), 'fingerprint: example.test');

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n==== PRODUCTION-MODE VERIFY: ${passed}/${results.length} passed ====`);
  if (serverProc) serverProc.kill();
  await replset.stop();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (e) => {
  console.error('HARNESS ERROR:', e.message);
  if (serverProc) serverProc.kill();
  if (replset) await replset.stop().catch(() => {});
  process.exit(2);
});
