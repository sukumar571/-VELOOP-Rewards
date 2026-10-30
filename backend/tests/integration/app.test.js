const request = require('supertest');
const app = require('../../src/app.js');
const { signAccessToken } = require('../../src/integrations/veloopAuth.js');

// No database is connected during tests, so endpoints that hit Mongo return an
// honest 503 — these tests assert that the pipeline never fabricates success.

const bearer = (claims) => `Bearer ${signAccessToken(claims)}`;

describe('health', () => {
  it('liveness returns 200 ok', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('veloop-giveaway-backend');
    expect(res.headers['x-request-id']).toMatch(/[0-9a-f-]{8,}/i);
  });

  it('readiness reports degraded (503) while the database is down — not fake-ok', async () => {
    const res = await request(app).get('/health/ready').expect(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.dependencies.database).toBe('disconnected');
  });

  it('serves security headers', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('CORS (restricted allow-list)', () => {
  it('echoes an allowed origin with credentials', async () => {
    const res = await request(app)
      .get('/api/v1')
      .set('Origin', 'http://localhost:5173')
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not set an allow-origin header for a disallowed origin', async () => {
    const res = await request(app).get('/api/v1').set('Origin', 'http://evil.example').expect(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('authentication & authorization', () => {
  it('rejects /auth/me with no token (401)', async () => {
    const res = await request(app).get('/api/v1/auth/me').expect(401);
    expect(res.body.error.code).toBe('LOGIN_REQUIRED');
    expect(res.body.requestId).toBeDefined();
  });

  it('rejects a malformed token (401 INVALID_TOKEN)', async () => {
    await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not.a.real.token')
      .expect(401);
  });

  it('returns the verified principal with a valid token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', bearer({ sub: 'usr-42', roles: ['user'], name: 'Zoe' }))
      .expect(200);
    expect(res.body.id).toBe('usr-42');
    expect(res.body.roles).toContain('user');
    expect(res.body.authProvider).toBe('dev-mock');
  });

  it('denies admin endpoints to a normal user (403)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', bearer({ sub: 'usr-42', roles: ['user'] }))
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('requires authentication for admin endpoints (401)', async () => {
    await request(app).get('/api/v1/admin/stats').expect(401);
  });
});

describe('validation & error envelope', () => {
  it('400 with field details for an invalid query param', async () => {
    const res = await request(app).get('/api/v1/giveaways?limit=abc').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.limit).toBeDefined();
  });

  it('400 INVALID_JSON for a malformed body', async () => {
    const res = await request(app)
      .post('/api/v1/giveaways')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('rejects an invalid ObjectId (400)', async () => {
    const res = await request(app).get('/api/v1/giveaways/not-an-objectid').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('404 for an unknown route', async () => {
    const res = await request(app).get('/does-not-exist').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns an honest 503 when a data route needs the offline database', async () => {
    const res = await request(app)
      .get('/api/v1/giveaways')
      .set('Authorization', bearer({ sub: 'usr-admin', roles: ['admin'] }))
      .expect(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});
