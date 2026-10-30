const { config, validateRuntimeConfig } = require('../../src/config/index.js');

function prodCfg(over = {}) {
  return {
    env: 'production',
    mongo: { uri: 'mongodb://db.internal/veloop', serverSelectionTimeoutMs: 5000, maxPoolSize: 20 },
    auth: {
      mode: 'jwt',
      jwtSecret: 'a-long-real-secret-from-secret-manager',
      jwtPublicKey: '',
      algorithms: ['RS256'],
      issuer: 'https://auth.veloop.example',
      audience: 'giveaway',
      devSecret: 'rotated-non-default-value',
    },
    security: {
      corsOrigins: ['https://giveaway.veloop.example'],
      jsonBodyLimit: '100kb',
      rateLimit: { windowMs: 60000, max: 300, authMax: 10, entryMax: 20 },
      eligibility: { geoSource: 'none', geoHeader: 'x-country-code' },
    },
    server: { trustProxy: false },
    // The wallet seam must be present in any production config: 'disabled' is a
    // valid (honest) choice, 'http' must be fully configured.
    wallet: { mode: 'disabled', baseUrl: '', apiKey: '', balancePath: '', debitPath: '', snapshotMaxAgeSeconds: 120 },
    ...over,
  };
}

describe('config: non-secret defaults for local/dev', () => {
  it('boots without a .env by providing safe defaults', () => {
    expect(config.env).toBe('test');
    expect(config.mongo.uri).toMatch(/^mongodb:\/\//);
    expect(['dev-mock', 'jwt']).toContain(config.auth.mode);
  });

  it('passes validation outside production', () => {
    expect(validateRuntimeConfig({ env: 'development', mongo: {}, auth: {}, security: {} })).toBe(true);
  });
});

describe('validateRuntimeConfig: production hard gate', () => {
  it('accepts a correctly-configured production setup', () => {
    expect(validateRuntimeConfig(prodCfg())).toBe(true);
  });

  it('rejects dev-mock auth in production', () => {
    const cfg = prodCfg({ auth: { ...prodCfg().auth, mode: 'dev-mock' } });
    expect(() => validateRuntimeConfig(cfg)).toThrow(/dev-mock is forbidden/i);
  });

  it('rejects jwt auth without a verification key', () => {
    const cfg = prodCfg({ auth: { ...prodCfg().auth, jwtSecret: '', jwtPublicKey: '' } });
    expect(() => validateRuntimeConfig(cfg)).toThrow(/requires JWT_SECRET/i);
  });

  it('rejects the default dev signing secret leaking into production', () => {
    const cfg = prodCfg({ auth: { ...prodCfg().auth, devSecret: 'change-me-local-dev-only' } });
    expect(() => validateRuntimeConfig(cfg)).toThrow(/DEV_JWT_SECRET must be changed/i);
  });

  it('rejects a wildcard/empty CORS allow-list in production', () => {
    const cfg = prodCfg({ security: { ...prodCfg().security, corsOrigins: ['*'] } });
    expect(() => validateRuntimeConfig(cfg)).toThrow(/explicit allow-list/i);
  });

  it('rejects a missing database URI', () => {
    const cfg = prodCfg({ mongo: { uri: '' } });
    expect(() => validateRuntimeConfig(cfg)).toThrow(/MONGODB_URI is required/i);
  });

  it('rejects a half-configured wallet seam instead of pretending it is connected', () => {
    const cfg = prodCfg({ wallet: { mode: 'http', baseUrl: 'https://wallet.example', apiKey: '', balancePath: '', debitPath: '' } });
    expect(() => validateRuntimeConfig(cfg)).toThrow(/WALLET_MODE=http requires WALLET_BASE_URL/i);
  });

  it('rejects an unknown WALLET_MODE', () => {
    const cfg = prodCfg({ wallet: { mode: 'magic' } });
    expect(() => validateRuntimeConfig(cfg)).toThrow(/WALLET_MODE must be/i);
  });

  it('refuses the fictional in-DB dev wallet in production', () => {
    const cfg = prodCfg({ wallet: { mode: 'dev', baseUrl: '', apiKey: '', balancePath: '', debitPath: '' } });
    expect(() => validateRuntimeConfig(cfg)).toThrow(/WALLET_MODE=dev is forbidden in production/i);
  });

  it('defaults the transaction requirement to fail-closed (true)', () => {
    // A paid join must not silently fall back to unsafe sequential writes.
    expect(config.wallet.requireTransactionSupport).toBe(true);
  });

  it('accepts the honest default: wallet disabled until the real contract exists', () => {
    expect(config.wallet.mode).toBe('disabled');
    expect(validateRuntimeConfig(prodCfg())).toBe(true);
  });

  it('rejects an unknown geo-evidence mode instead of guessing a country', () => {
    const cfg = prodCfg({
      security: { ...prodCfg().security, eligibility: { geoSource: 'guess' } },
    });
    expect(() => validateRuntimeConfig(cfg)).toThrow(/ELIGIBILITY_GEO_SOURCE must be/i);
  });

  it('refuses header-based geo evidence on an app that trusts no proxy', () => {
    const cfg = prodCfg({
      security: { ...prodCfg().security, eligibility: { geoSource: 'header', geoHeader: 'x-country-code' } },
      server: { trustProxy: false },
    });
    expect(() => validateRuntimeConfig(cfg)).toThrow(/requires TRUST_PROXY/i);
  });

  it('keeps entry writes throttled below the general read budget', () => {
    expect(config.security.rateLimit.entryMax).toBeLessThanOrEqual(config.security.rateLimit.max);
  });
});
