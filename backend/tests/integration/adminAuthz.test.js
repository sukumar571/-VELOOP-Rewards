/**
 * ============================================================================
 * ADMIN AUTHORIZATION + AUDIT — who may act, and what is recorded when they do.
 * ============================================================================
 * The security invariant under test: an admin action is authorized ONLY from the
 * verified token PLUS the roles stored server-side — never from a body field and
 * never from a token `roles` claim alone. The chain is
 * `authenticate -> requireAdmin -> resolveIdentity -> requireAdmin`:
 *   - no token            -> 401 (authenticate)
 *   - a plain user token  -> 403 (first requireAdmin)
 *   - token CLAIMS admin but the STORE says user -> 403 (SECOND requireAdmin,
 *     after resolveIdentity overwrites the claim with the store roles). `User.resolve`
 *     seeds roles with `$setOnInsert`, so pre-creating the account as 'user' means a
 *     later admin-claiming token is NOT upgraded — the tampering path.
 * The winner section proves the draw's safety invariants: repeated selection is
 * refused, concurrent draws never exceed `Prize.winnerCount`, and an oversized
 * `count` is capped. Finally every admin action must leave an immutable AuditLog
 * row with no raw PII.
 * ========================================================================= */
jest.setTimeout(180000);

jest.mock('../../src/integrations/veloopWallet.js', () => ({
  isConfigured: jest.fn(() => true),
  mode: jest.fn(() => 'http'),
  getBalance: jest.fn(async ({ userId, currency }) => ({ userId: String(userId), currency, balance: 1_000_000, observedAt: new Date(), source: 'VELOOP_API' })),
  debit: jest.fn(async () => ({ status: 'SUCCESS', externalTransactionId: 'ext-1', balanceBefore: 1000, balanceAfter: 950 })),
  reverse: jest.fn(async () => ({ status: 'SUCCESS', externalTransactionId: 'rev-1', balanceAfter: 1000 })),
}));

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

const app = require('../../src/app.js');
const models = require('../../src/models/index.js');
const { config } = require('../../src/config/index.js');
const { signAccessToken } = require('../../src/integrations/veloopAuth.js');

const { Giveaway, Prize, User, GiveawayParticipation, AuditLog } = models;
const OVER = { overrideHistoryGuard: true };
const rid = () => Math.random().toString(36).slice(2, 10);
const bearer = (claims) => `Bearer ${signAccessToken(claims)}`;

const adminHeader = bearer({ sub: `admin-${rid()}`, roles: ['admin'] });

async function createEndedDraw({ winnerCount = 1, participants = 5 } = {}) {
  const now = Date.now();
  const giveaway = await Giveaway.create({
    title: `Authz Draw ${rid()}`, slug: `authz-${rid()}`,
    startAt: new Date(now - 86_400_000), endAt: new Date(now - 1000), // ENDED window
    status: 'ENDED', published: true, eligibility: {},
    participation: { entryCurrencies: ['VE'], freeEntryCount: 1, maxEntriesPerUser: 5, requireDeviceReference: false },
    prizeConfig: { drawMethod: 'RANDOM', allowDuplicateWinners: false, claimWindowDays: 7 },
  });
  const prize = await Prize.create({
    giveawayId: giveaway._id, name: `P ${rid()}`, position: 1, winnerCount,
    prizeType: 'DIGITAL', claimType: 'DIGITAL_DELIVERY', entryCurrency: 'VE', entryAmount: 0,
  });
  for (let i = 0; i < participants; i += 1) {
    await GiveawayParticipation.create({
      userId: new mongoose.Types.ObjectId(), giveawayId: giveaway._id, prizeId: prize._id,
      entryCurrency: 'VE', entryAmount: 0, entryCount: 1, deviceRef: {}, status: 'CONFIRMED', joinedAt: new Date(),
    });
  }
  return { giveaway, prize };
}

let mongod;
let originalFraudEnabled;

beforeAll(async () => {
  mongoose.set('autoIndex', false);
  mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } }); // cold mongod start on Windows can exceed the 10s default
  await mongoose.connect(mongod.getUri('veloop_admin_authz_test'), { serverSelectionTimeoutMS: 10000 });
  await Promise.all(Object.values(models).map((m) => m.syncIndexes()));
  // These tests are about authorization and the draw, not the risk engine.
  originalFraudEnabled = config.security.fraud.enabled;
  config.security.fraud.enabled = false;
});

afterAll(async () => {
  config.security.fraud.enabled = originalFraudEnabled;
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  for (const Model of Object.values(models)) await Model.deleteMany({}, OVER);
});

// ---------------------------------------------------------------------------
describe('admin endpoints are deny-by-default', () => {
  const writeRoutes = [
    ['post', '/api/v1/admin/giveaways'],
    ['post', '/api/v1/admin/claims/expire'],
    ['get', '/api/v1/admin/stats'],
    ['get', '/api/v1/admin/audit-logs'],
  ];

  it.each(writeRoutes)('%s %s -> 401 without any token', async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  it.each(writeRoutes)('%s %s -> 403 for an authenticated NON-admin', async (method, path) => {
    const res = await request(app)[method](path).set('Authorization', bearer({ sub: `user-${rid()}`, roles: ['user'] })).send({});
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
describe('a role claim in the token cannot mint authority the store denies', () => {
  it('token says admin but the stored account is a plain user -> admin write refused (403)', async () => {
    const veloopId = `claimed-admin-${rid()}`;
    // First sight is as a USER; $setOnInsert means this role can never be upgraded
    // by a subsequent token claim.
    await User.create({ veloopId, email: `${veloopId}@example.com`, roles: ['user'], status: 'ACTIVE' });

    const res = await request(app)
      .post('/api/v1/admin/claims/expire')
      .set('Authorization', bearer({ sub: veloopId, roles: ['admin'] }))
      .send({})
      .expect(403);
    expect(res.body.error).toBeDefined();
    // The impersonation attempt left no state change behind.
    expect(await AuditLog.countDocuments({ action: 'claim.expire_sweep' })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('winner selection is conflict-safe and capped', () => {
  it('a completed tier refuses a repeated selection with WINNERS_ALREADY_SELECTED', async () => {
    const { giveaway, prize } = await createEndedDraw({ winnerCount: 1, participants: 4 });
    const first = await request(app)
      .post(`/api/v1/admin/giveaways/${giveaway._id}/winners/draw`)
      .set('Authorization', adminHeader).send({ prizeId: String(prize._id) }).expect(201);
    expect(first.body.data.drawn).toHaveLength(1);

    const again = await request(app)
      .post(`/api/v1/admin/giveaways/${giveaway._id}/winners/draw`)
      .set('Authorization', adminHeader).send({ prizeId: String(prize._id) });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('WINNERS_ALREADY_SELECTED');
  });

  it('an oversized count is capped to the prize winnerCount', async () => {
    const { giveaway, prize } = await createEndedDraw({ winnerCount: 1, participants: 6 });
    const res = await request(app)
      .post(`/api/v1/admin/giveaways/${giveaway._id}/winners/draw`)
      .set('Authorization', adminHeader).send({ prizeId: String(prize._id), count: 500 }).expect(201);
    expect(res.body.data.drawn).toHaveLength(1); // min(freeSlots=1, count=500)
    expect(await models.GiveawayWinner.countDocuments({ prizeId: prize._id })).toBe(1);
  });

  it('concurrent draws can never create more winners than the prize allows', async () => {
    const winnerCount = 2;
    const { giveaway, prize } = await createEndedDraw({ winnerCount, participants: 8 });

    // Fire several draws at once against the same tier. The unique (prizeId, rank)
    // index and the freeSlots guard are the last line; we assert the INVARIANT, not
    // the individual statuses (racing calls may 201, 409, or a caught 11000 -> 500).
    const results = await Promise.all(
      Array.from({ length: 4 }, () => request(app)
        .post(`/api/v1/admin/giveaways/${giveaway._id}/winners/draw`)
        .set('Authorization', adminHeader).send({ prizeId: String(prize._id) })),
    );

    const winners = await models.GiveawayWinner.find({ prizeId: prize._id });
    expect(winners.length).toBeGreaterThan(0);
    expect(winners.length).toBeLessThanOrEqual(winnerCount);
    // Ranks are unique (no duplicate-slot corruption) even under concurrency.
    expect(new Set(winners.map((w) => w.rank)).size).toBe(winners.length);
    // At least one draw must have cleanly succeeded.
    expect(results.some((r) => r.status === 201)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('every authorized admin action is audited without leaking PII', () => {
  it('records actor/action/entity/timestamp on the draw', async () => {
    const { giveaway, prize } = await createEndedDraw({ winnerCount: 1, participants: 3 });
    await request(app)
      .post(`/api/v1/admin/giveaways/${giveaway._id}/winners/draw`)
      .set('Authorization', adminHeader).send({ prizeId: String(prize._id) }).expect(201);

    const audit = await AuditLog.findOne({ action: 'giveaway.winners.draw' });
    expect(audit).not.toBeNull();
    expect(audit.entityType).toBe('Prize');
    expect(String(audit.entityId)).toBe(String(prize._id));
    expect(audit.actorId).toBeTruthy();       // the acting admin's resolved account id
    expect(audit.actorRole).toBe('admin');
    expect(audit.createdAt).toBeInstanceOf(Date);
    expect(audit.after.drawn).toBe(1);
    // The audit trail stores references and counters — never raw participant PII.
    expect(JSON.stringify(audit)).not.toMatch(/@example\.com/);
  });
});
