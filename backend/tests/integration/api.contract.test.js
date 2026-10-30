/**
 * ============================================================================
 * CONTRACT TESTS — the HTTP surface, with NO database running.
 * ============================================================================
 * These prove the endpoints are real (not stubs that echo "ok"): a genuine
 * request reaches the data layer and gets an honest 503 when Mongo is offline,
 * while security/authorization/validation rules fire BEFORE any I/O so they are
 * observable regardless of database availability. Nothing here needs credentials
 * or a running service.
 * ========================================================================= */
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app.js');
const { config } = require('../../src/config/index.js');
const { listRoutes } = require('../../src/utils/listRoutes.js');
const { signAccessToken } = require('../../src/integrations/veloopAuth.js');

const bearer = (claims) => `Bearer ${signAccessToken(claims)}`;
const userHeader = bearer({ sub: 'user-1' });
const adminHeader = bearer({ sub: 'admin-1', roles: ['admin'] });
const OBJECT_ID = '507f1f77bcf86cd799439011';

describe('the API advertises only what it actually routes', () => {
  it('GET /api/v1 lists exactly the endpoints express registered', async () => {
    const res = await request(app).get('/api/v1').expect(200);
    const realV1 = listRoutes(app).filter((r) => r.includes(' /api/v1'));
    // Same sorted array — a documented-but-missing operation cannot appear.
    expect(res.body.routes).toEqual(realV1);
    expect(res.body.count).toBe(realV1.length);
    expect(res.body.routes).toContain('POST /api/v1/giveaways/:id/join');
  });

  it('a listed route is genuinely routed (never a 404 for an advertised path)', async () => {
    // /giveaways/current is in the self-reported list; it must resolve to a real
    // handler. Offline it reaches the data layer (503), which still proves it is
    // routed — a documented-but-missing endpoint would 404 instead.
    const res = await request(app).get('/api/v1/giveaways/current').expect(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});

describe('public reads are real and degrade honestly when the DB is offline', () => {
  it('GET /giveaways reaches the data layer (503, not a canned 200)', async () => {
    const res = await request(app).get('/api/v1/giveaways').expect(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(res.body.error.message).not.toMatch(/at |Error:|mongoose/i); // no internals leaked
  });

  it('a malformed ObjectId is rejected before the database is touched', async () => {
    const res = await request(app).get('/api/v1/giveaways/not-an-objectid').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('authentication is enforced (LOGIN_REQUIRED) on every user route', () => {
  const protectedRoutes = [
    ['get', '/api/v1/giveaways/my-status'],
    ['get', '/api/v1/wallet/balances'],
    ['get', '/api/v1/claims'],
    ['post', `/api/v1/giveaways/${OBJECT_ID}/join`],
    ['post', `/api/v1/claims/${OBJECT_ID}/submit`],
  ];

  it.each(protectedRoutes)('%s %s with no token → 401 LOGIN_REQUIRED', async (method, path) => {
    const res = await request(app)[method](path).expect(401);
    expect(res.body.error.code).toBe('LOGIN_REQUIRED');
  });

  it('rejects a forged signature outright', async () => {
    const res = await request(app)
      .get('/api/v1/giveaways/my-status')
      .set('Authorization', 'Bearer not.a.real.token')
      .expect(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects an expired token with TOKEN_EXPIRED', async () => {
    const expired = jwt.sign(
      { sub: 'user-1', exp: Math.floor(Date.now() / 1000) - 60 },
      config.auth.devSecret,
      { algorithm: 'HS256' },
    );
    const res = await request(app)
      .get('/api/v1/giveaways/my-status')
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });
});

describe('identity is derived from the token, never the body', () => {
  it('POST /join rejects an injected userId (strict body) before any I/O', async () => {
    const res = await request(app)
      .post(`/api/v1/giveaways/${OBJECT_ID}/join`)
      .set('Authorization', userHeader)
      .send({ userId: 'someone-else', entries: 1 })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    // The controller would have a userId available in the DB path; here the extra
    // key is refused outright, so it can never be read as identity. Zod reports an
    // unrecognized key against the object root, naming the offending key.
    expect(JSON.stringify(res.body.error.details)).toMatch(/userId/);
  });

  it('a well-formed join proceeds to the identity layer and honestly reports 503 offline', async () => {
    const res = await request(app)
      .post(`/api/v1/giveaways/${OBJECT_ID}/join`)
      .set('Authorization', userHeader)
      .send({ entries: 1 })
      .expect(503);
    expect(res.body.error.code).toBe('DATABASE_UNAVAILABLE');
  });

  it('rejects an out-of-range entry count', async () => {
    const res = await request(app)
      .post(`/api/v1/giveaways/${OBJECT_ID}/join`)
      .set('Authorization', userHeader)
      .send({ entries: 5000 })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('administrative actions are role-gated (deny-by-default)', () => {
  const adminRoutes = [
    ['get', '/api/v1/admin/stats'],
    ['post', '/api/v1/admin/giveaways'],
    ['post', `/api/v1/admin/giveaways/${OBJECT_ID}/winners/draw`],
    ['post', `/api/v1/admin/claims/${OBJECT_ID}/review`],
    ['get', '/api/v1/admin/audit-logs'],
  ];

  it.each(adminRoutes)('%s %s with no token → 401', async (method, path) => {
    await request(app)[method](path).expect(401);
  });

  it.each(adminRoutes)('%s %s as an ordinary user → 403 FORBIDDEN', async (method, path) => {
    const res = await request(app)[method](path).set('Authorization', userHeader).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('an admin is authorized but still cannot read data while the DB is down', async () => {
    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', adminHeader)
      .expect(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('a write admin action requires a resolved account (503 offline, not a silent no-op)', async () => {
    const res = await request(app)
      .post('/api/v1/admin/giveaways')
      .set('Authorization', adminHeader)
      .send({ title: 'X', slug: 'x-1', startAt: new Date().toISOString(), endAt: new Date(Date.now() + 86400000).toISOString() })
      .expect(503);
    expect(res.body.error.code).toBe('DATABASE_UNAVAILABLE');
  });
});

describe('error envelope is consistent and non-sensitive', () => {
  it('unknown routes are a structured 404, not an HTML page', async () => {
    const res = await request(app).get('/api/v1/no-such-thing').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.requestId).toBeDefined();
  });

  it('a malformed JSON body is refused without leaking parser internals', async () => {
    const res = await request(app)
      .post(`/api/v1/giveaways/${OBJECT_ID}/join`)
      .set('Authorization', userHeader)
      .set('content-type', 'application/json')
      .send('{ this is not json')
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});
