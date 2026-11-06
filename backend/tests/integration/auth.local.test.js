/**
 * ============================================================================
 * LOCAL-ACCOUNT AUTH INTEGRATION — signup + login against a REAL MongoDB.
 * ============================================================================
 * The regression this suite exists to catch: `login()` used to null the
 * in-memory `passwordHash` and then call `save()`, which Mongoose translated
 * into a `$unset` that DELETED the stored hash. The first login succeeded and
 * every subsequent one failed with INVALID_CREDENTIALS. The "can log in twice"
 * test below is the guard; it asserts the persisted row still carries a bcrypt
 * hash after a successful login.
 *
 * Uses a single-node `MongoMemoryServer` (no transactions on this path) and the
 * real HTTP pipeline via supertest, so the validators, limiter-free routes and
 * the JWT minting are all exercised end to end.
 * ========================================================================= */
jest.setTimeout(180000);

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

const app = require('../../src/app.js');
const models = require('../../src/models/index.js');
const User = models.User;

const OVER = { overrideHistoryGuard: true };
let mongod;

const rid = () => Math.random().toString(36).slice(2, 10);
const email = () => `qa-${rid()}-${Date.now()}@veloop.example`;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create({ instance: { dbName: 'veloop_auth_test' } });
  await mongoose.connect(mongod.getUri('veloop_auth_test'), { serverSelectionTimeoutMS: 15000 });
  await Promise.all(Object.values(models).map((m) => m.syncIndexes()));
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  for (const Model of Object.values(models)) await Model.deleteMany({}, OVER);
});

describe('POST /api/v1/auth/signup', () => {
  it('creates a local account, persists a bcrypt hash, and returns a token', async () => {
    const mail = email();
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ name: 'QA Member', email: mail, password: 'Passw0rd!' })
      .expect(201);

    expect(res.body.data.user).toMatchObject({ email: mail, name: 'QA Member', authProvider: 'local', status: 'ACTIVE' });
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(typeof res.body.data.token).toBe('string');

    const row = await User.findLocalByEmail(mail);
    expect(row.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(row.veloopId).toBe(User.localVeloopId(mail));
  });

  it('rejects a duplicate email with 409 EMAIL_TAKEN', async () => {
    const mail = email();
    await request(app).post('/api/v1/auth/signup').send({ name: 'Dup One', email: mail, password: 'Passw0rd!' }).expect(201);
    const res = await request(app).post('/api/v1/auth/signup').send({ name: 'Dup Two', email: mail, password: 'Passw0rd!' }).expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });
});

describe('POST /api/v1/auth/login', () => {
  it('authenticates with the correct password and returns a token', async () => {
    const mail = email();
    await request(app).post('/api/v1/auth/signup').send({ name: 'QA', email: mail, password: 'Passw0rd!' }).expect(201);
    const res = await request(app).post('/api/v1/auth/login').send({ email: mail, password: 'Passw0rd!' }).expect(200);
    expect(res.body.data.user.email).toBe(mail);
    expect(typeof res.body.data.token).toBe('string');
  });

  it('can log in TWICE with the same password (regression: login must not wipe the hash)', async () => {
    const mail = email();
    await request(app).post('/api/v1/auth/signup').send({ name: 'QA', email: mail, password: 'Passw0rd!' }).expect(201);

    await request(app).post('/api/v1/auth/login').send({ email: mail, password: 'Passw0rd!' }).expect(200);
    // The persisted row must STILL carry a bcrypt hash after the first login.
    const afterFirst = await User.findLocalByEmail(mail);
    expect(afterFirst.passwordHash).toMatch(/^\$2[aby]\$/);

    // Second login must also succeed — this is what broke when save() $unset the hash.
    await request(app).post('/api/v1/auth/login').send({ email: mail, password: 'Passw0rd!' }).expect(200);
    const afterSecond = await User.findLocalByEmail(mail);
    expect(afterSecond.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('rejects a wrong password with 401 INVALID_CREDENTIALS', async () => {
    const mail = email();
    await request(app).post('/api/v1/auth/signup').send({ name: 'QA', email: mail, password: 'Passw0rd!' }).expect(201);
    const res = await request(app).post('/api/v1/auth/login').send({ email: mail, password: 'wrong-pass' }).expect(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an unknown email with the same 401 INVALID_CREDENTIALS (no enumeration)', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: email(), password: 'Passw0rd!' }).expect(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});
