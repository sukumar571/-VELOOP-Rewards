#!/usr/bin/env node
/**
 * mintDevToken — DEVELOPMENT/TEST ONLY helper.
 *
 * Prints a locally-signed access token for exercising the API and /auth/me when
 * no VELOOP issuer is connected. It uses the dev-mock signing path and REFUSES
 * to run in production. This is a CLI tool, not an endpoint — it never returns
 * success on its own and cannot mint a token a real issuer would trust.
 *
 * Usage:
 *   npm run token:dev -- --sub=usr-demo-001 --roles=user --name="Demo Member"
 *   npm run token:dev -- --roles=admin
 */
const { config } = require('../config/index.js');
const { signAccessToken } = require('../integrations/veloopAuth.js');

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

function main() {
  if (config.isProduction) {
    console.error('Refusing to mint a dev token in production.');
    process.exit(1);
  }
  if (config.auth.mode !== 'dev-mock') {
    console.error(
      `Cannot mint a dev token while AUTH_MODE=${config.auth.mode}. ` +
        'Tokens must come from the real VELOOP issuer.',
    );
    process.exit(1);
  }

  const args = parseArgs(process.argv);
  const roles = String(args.roles || 'user')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  const claims = {
    sub: args.sub || 'usr-demo-001',
    name: args.name || 'Demo Member',
    roles,
  };
  if (args.email) claims.email = args.email;

  const token = signAccessToken(claims);
  console.log(JSON.stringify({ claims, token }, null, 2));
}

if (require.main === module) main();
