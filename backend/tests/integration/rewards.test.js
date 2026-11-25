/**
 * ============================================================================
 * REWARD WALLET, ACTIVITIES, REFERRALS & CODES — end-to-end API tests.
 * ============================================================================
 * Real HTTP against a real (in-memory) MongoDB, so the guarantees under test are
 * the database's, not the test's: unique claim keys, unique redemption keys,
 * atomic balance updates, and owner-scoped reads.
 * ========================================================================= */
jest.setTimeout(180000);

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

const app = require('../../src/app.js');
const models = require('../../src/models/index.js');
const referralService = require('../../src/services/referral.service.js');
const { signAccessToken } = require('../../src/integrations/veloopAuth.js');

const { RewardWallet, WalletTransaction, ActivityClaim, Referral } = models;

const bearer = (claims) => `Bearer ${signAccessToken(claims)}`;
const adminHeader = bearer({ sub: 'reward-admin-1', roles: ['admin'] });
const rid = () => Math.random().toString(36).slice(2, 10);

let mongod;

async function signup(name = 'Reward Tester') {
  const email = `${name.toLowerCase().replace(/\s+/g, '.')}.${rid()}@example.com`;
  const res = await request(app)
    .post('/api/v1/auth/signup')
    .send({ name, email, password: 'Secret@123', referralCode: undefined })
    .expect(201);
  return { token: res.body.data.token, id: res.body.data.user.id, email };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function walletOf(token) {
  const res = await request(app).get('/api/v1/rewards/wallet').set(auth(token)).expect(200);
  return res.body.data;
}

async function activityId(token, key) {
  const res = await request(app).get('/api/v1/rewards/activities').set(auth(token)).expect(200);
  const row = res.body.data.items.find((a) => a.key === key);
  if (!row) throw new Error(`activity ${key} missing`);
  return row.id;
}

beforeAll(async () => {
  mongoose.set('autoIndex', false);
  mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  await mongoose.connect(mongod.getUri('veloop_rewards_test'), { serverSelectionTimeoutMS: 10000 });
  await Promise.all(Object.values(models).map((m) => m.syncIndexes()));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  // `overrideHistoryGuard` is the documented test/ops escape hatch for the
  // append-only guards on User (and the ledger); production code never uses it.
  for (const Model of Object.values(models)) {
    await Model.deleteMany({}, { overrideHistoryGuard: true });
  }
  // Reset the stored referral config between tests.
  await models.SystemSetting.deleteMany({ key: 'reward.referral' });
});

// ---------------------------------------------------------------------------
describe('wallet initialisation', () => {
  it('gives a brand-new account zero VEs, SVEs and Tokens — and only one wallet', async () => {
    const u = await signup('Zero Wallet');
    const wallet = await walletOf(u.token);
    expect(wallet.balances).toEqual({ VE: 0, SVE: 0, TOKEN: 0 });
    expect(wallet.recentTransactions).toEqual([]);
    expect(await RewardWallet.countDocuments({ userId: u.id })).toBe(1);
  });

  it('retains an existing balance on later reads and logins', async () => {
    const u = await signup('Keep Balance');
    await request(app)
      .post(`/api/v1/admin/rewards/wallets/${u.id}/adjust`)
      .set('Authorization', adminHeader)
      .send({ currency: 'VE', amount: 400, direction: 'CREDIT', reason: 'Migration of earned balance' })
      .expect(200);

    const first = await walletOf(u.token);
    const second = await walletOf(u.token);
    expect(first.balances.VE).toBe(400);
    expect(second.balances.VE).toBe(400);
    expect(await RewardWallet.countDocuments({ userId: u.id })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('reward activities', () => {
  it('lists admin-configured activities and credits a valid claim once', async () => {
    const u = await signup('Activity User');
    const list = await request(app).get('/api/v1/rewards/activities').set(auth(u.token)).expect(200);
    expect(list.body.data.items.length).toBeGreaterThan(0);
    const daily = list.body.data.items.find((a) => a.key === 'daily-login');
    expect(daily).toMatchObject({ currency: 'VE', amount: 25, claimMode: 'DAILY' });
    expect(daily.eligibility.eligible).toBe(true);

    const claimed = await request(app)
      .post(`/api/v1/rewards/activities/${daily.id}/claim`)
      .set(auth(u.token))
      .expect(201);
    expect(claimed.body.data).toMatchObject({ currency: 'VE', amount: 25, balance: 25 });

    // Immediately claiming the same period again is refused.
    const dup = await request(app)
      .post(`/api/v1/rewards/activities/${daily.id}/claim`)
      .set(auth(u.token))
      .expect(409);
    expect(dup.body.error.code).toBe('REWARD_ALREADY_CLAIMED');
    expect((await walletOf(u.token)).balances.VE).toBe(25);
  });

  it('rejects a claim from an account that does not yet meet the age rule', async () => {
    const u = await signup('Too New');
    const created = await request(app)
      .post('/api/v1/admin/rewards/activities')
      .set('Authorization', adminHeader)
      .send({
        key: `aged-${rid()}`,
        title: 'Mature accounts only',
        currency: 'SVE',
        amount: 10,
        claimMode: 'ONCE',
        maxClaimsPerUser: 1,
        eligibility: { minAccountAgeHours: 48 },
      })
      .expect(201);

    const res = await request(app)
      .post(`/api/v1/rewards/activities/${created.body.data.id}/claim`)
      .set(auth(u.token))
      .expect(403);
    expect(res.body.error.code).toBe('REWARD_NOT_ELIGIBLE');
    expect(res.body.error.details.reason).toBe('ACCOUNT_TOO_NEW');
    expect((await walletOf(u.token)).balances.SVE).toBe(0);
  });

  it('rejects an expired activity', async () => {
    const u = await signup('Late Claimer');
    const created = await request(app)
      .post('/api/v1/admin/rewards/activities')
      .set('Authorization', adminHeader)
      .send({
        key: `expired-${rid()}`,
        title: 'Closed campaign',
        currency: 'TOKEN',
        amount: 10,
        claimMode: 'ONCE',
        endsAt: new Date(Date.now() - 60_000).toISOString(),
      })
      .expect(201);

    const res = await request(app)
      .post(`/api/v1/rewards/activities/${created.body.data.id}/claim`)
      .set(auth(u.token))
      .expect(410);
    expect(res.body.error.code).toBe('REWARD_ACTIVITY_EXPIRED');
  });

  it('cannot double-credit one claim under concurrent requests', async () => {
    const u = await signup('Concurrent Claimer');
    const id = await activityId(u.token, 'social-share');

    const results = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(app).post(`/api/v1/rewards/activities/${id}/claim`).set(auth(u.token)),
      ),
    );
    const codes = results.map((r) => r.status).sort();
    expect(codes).toEqual([201, 409]);
    expect(await ActivityClaim.countDocuments({ userId: u.id, activityId: id })).toBe(1);
    expect((await walletOf(u.token)).balances.SVE).toBe(20);
  });
});

// ---------------------------------------------------------------------------
describe('reward codes', () => {
  it('validates a code, then credits its stored amount and blocks a duplicate', async () => {
    const u = await signup('Code User');

    const preview = await request(app)
      .post('/api/v1/rewards/codes/validate')
      .set(auth(u.token))
      .send({ code: 'veloop100' })
      .expect(200);
    expect(preview.body.data).toMatchObject({ code: 'VELOOP100', currency: 'VE', amount: 100 });

    const redeemed = await request(app)
      .post('/api/v1/rewards/codes/redeem')
      .set(auth(u.token))
      .send({ code: 'VELOOP100' })
      .expect(200);
    expect(redeemed.body.data).toMatchObject({ currency: 'VE', amount: 100, balance: 100 });

    const dup = await request(app)
      .post('/api/v1/rewards/codes/redeem')
      .set(auth(u.token))
      .send({ code: 'VELOOP100' })
      .expect(409);
    expect(dup.body.error.code).toBe('REDEEM_CODE_ALREADY_REDEEMED');

    expect((await walletOf(u.token)).balances.VE).toBe(100);
  });

  it('rejects an unknown code and an expired code', async () => {
    const u = await signup('Bad Code User');
    const invalid = await request(app)
      .post('/api/v1/rewards/codes/redeem')
      .set(auth(u.token))
      .send({ code: 'NOT-A-CODE' })
      .expect(422);
    expect(invalid.body.error.code).toBe('REDEEM_CODE_INVALID');

    const expired = await request(app)
      .post('/api/v1/admin/rewards/codes')
      .set('Authorization', adminHeader)
      .send({
        code: `OLD${rid()}`.toUpperCase(),
        label: 'Expired',
        currency: 'VE',
        amount: 50,
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      })
      .expect(201);

    const res = await request(app)
      .post('/api/v1/rewards/codes/redeem')
      .set(auth(u.token))
      .send({ code: expired.body.data.code })
      .expect(410);
    expect(res.body.error.code).toBe('REWARD_CODE_EXPIRED');
  });

  it('enforces a total redemption cap across accounts', async () => {
    const a = await signup('Limit A');
    const b = await signup('Limit B');
    const created = await request(app)
      .post('/api/v1/admin/rewards/codes')
      .set('Authorization', adminHeader)
      .send({
        code: `ONE${rid()}`.toUpperCase(),
        currency: 'TOKEN',
        amount: 5,
        maxRedemptions: 1,
        perUserLimit: 1,
      })
      .expect(201);
    const code = created.body.data.code;

    await request(app).post('/api/v1/rewards/codes/redeem').set(auth(a.token)).send({ code }).expect(200);
    const res = await request(app)
      .post('/api/v1/rewards/codes/redeem')
      .set(auth(b.token))
      .send({ code })
      .expect(409);
    expect(res.body.error.code).toBe('REWARD_CODE_LIMIT_REACHED');
    expect((await walletOf(b.token)).balances.TOKEN).toBe(0);
  });

  it('ignores a client-supplied amount — the stored code amount is credited', async () => {
    const u = await signup('Tamper User');
    await request(app)
      .post('/api/v1/rewards/codes/redeem')
      .set(auth(u.token))
      .send({ code: 'SOCIAL50', amount: 999999, currency: 'TOKEN' })
      .expect(400); // the strict body schema refuses unknown fields outright
    expect((await walletOf(u.token)).balances).toEqual({ VE: 0, SVE: 0, TOKEN: 0 });
  });

  it('records an accurate transaction history', async () => {
    const u = await signup('History User');
    const id = await activityId(u.token, 'social-share');
    await request(app).post(`/api/v1/rewards/activities/${id}/claim`).set(auth(u.token)).expect(201);
    await request(app).post('/api/v1/rewards/codes/redeem').set(auth(u.token)).send({ code: 'VELOOP100' }).expect(200);

    const history = await request(app)
      .get('/api/v1/rewards/transactions?limit=50')
      .set(auth(u.token))
      .expect(200);
    expect(history.body.data).toHaveLength(2);
    expect(history.body.meta.total).toBe(2);

    const byType = Object.fromEntries(history.body.data.map((t) => [t.type, t]));
    expect(byType.ACTIVITY_REWARD).toMatchObject({ direction: 'CREDIT', currency: 'SVE', amount: 20, status: 'SUCCESS' });
    expect(byType.PROMO_CODE).toMatchObject({ direction: 'CREDIT', currency: 'VE', amount: 100, status: 'SUCCESS' });
    expect(JSON.stringify(history.body)).not.toMatch(/idempotencyKey|requestId/);

    const wallet = await walletOf(u.token);
    expect(wallet.balances).toEqual({ VE: 100, SVE: 20, TOKEN: 0 });
  });
});

// ---------------------------------------------------------------------------
describe('referrals', () => {
  async function configureReferral(overrides = {}) {
    await request(app)
      .put('/api/v1/admin/rewards/referral-config')
      .set('Authorization', adminHeader)
      .send({
        enabled: true,
        referrerReward: { currency: 'VE', amount: 100 },
        refereeReward: null,
        qualification: { minAccountAgeHours: 0, requireParticipation: false, autoApprove: true },
        maxReferralsPerUser: 100,
        ...overrides,
      })
      .expect(200);
  }

  it('records a valid referral and credits the configured reward after qualification', async () => {
    const inviter = await signup('Inviter');
    const overview = await request(app).get('/api/v1/rewards/referral').set(auth(inviter.token)).expect(200);
    const code = overview.body.data.code;
    expect(code).toMatch(/^VL[A-Z0-9]{6}$/);
    expect(overview.body.data.link).toContain(`ref=${code}`);

    const invited = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        name: 'Invited Friend',
        email: `invited.${rid()}@example.com`,
        password: 'Secret@123',
        referralCode: code,
      })
      .expect(201);

    // Default rules need a 24h-old account, so it is genuinely PENDING at first.
    const pending = await request(app).get('/api/v1/rewards/referral').set(auth(inviter.token)).expect(200);
    expect(pending.body.data.counts).toMatchObject({ total: 1, pending: 1, qualified: 0 });
    expect((await walletOf(inviter.token)).balances.VE).toBe(0);

    // An administrator can relax the rule; the next read qualifies and credits once.
    await configureReferral();
    const qualified = await request(app).get('/api/v1/rewards/referral').set(auth(inviter.token)).expect(200);
    expect(qualified.body.data.counts).toMatchObject({ total: 1, pending: 0, qualified: 1 });
    expect(qualified.body.data.rewardHistory).toHaveLength(1);
    expect(qualified.body.data.rewardHistory[0]).toMatchObject({ currency: 'VE', amount: 100 });

    const wallet = await walletOf(inviter.token);
    expect(wallet.balances.VE).toBe(100);
    const txns = await request(app).get('/api/v1/rewards/transactions').set(auth(inviter.token)).expect(200);
    expect(txns.body.data.filter((t) => t.type === 'REFERRAL_REWARD')).toHaveLength(1);

    // The invited account received nothing (the administrator configured null).
    expect((await walletOf(invited.body.data.token)).balances.VE).toBe(0);

    // A second read must not pay twice.
    await request(app).get('/api/v1/rewards/referral').set(auth(inviter.token)).expect(200);
    expect((await walletOf(inviter.token)).balances.VE).toBe(100);
  });

  it('rejects self-referral and duplicate referral', async () => {
    const inviter = await signup('Self Referrer');
    const { code } = (await request(app).get('/api/v1/rewards/referral').set(auth(inviter.token)).expect(200)).body.data;

    await expect(
      referralService.createForNewUser({ referee: { _id: inviter.id }, referralCode: code }),
    ).rejects.toMatchObject({ code: 'REFERRAL_SELF' });

    const invited = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        name: 'Once Referred',
        email: `once.${rid()}@example.com`,
        password: 'Secret@123',
        referralCode: code,
      })
      .expect(201);

    await expect(
      referralService.createForNewUser({ referee: { _id: invited.body.data.user.id }, referralCode: code }),
    ).rejects.toMatchObject({ code: 'REFERRAL_DUPLICATE' });
    expect(await Referral.countDocuments({})).toBe(1);
  });

  it('refuses signup with an unknown referral code', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        name: 'Bad Invite',
        email: `bad-referral.${rid()}@example.com`,
        password: 'Secret@123',
        referralCode: 'VLNOPE00',
      })
      .expect(422);
    expect(res.body.error.code).toBe('REFERRAL_INVALID_CODE');
    expect(await models.User.countDocuments({ email: res.request?.email })).toBe(0);
  });

  it('lets an administrator reject a pending referral', async () => {
    const inviter = await signup('Reject Inviter');
    const { code } = (await request(app).get('/api/v1/rewards/referral').set(auth(inviter.token))).body.data;
    await request(app)
      .post('/api/v1/auth/signup')
      .send({ name: 'Flagged', email: `flagged.${rid()}@example.com`, password: 'Secret@123', referralCode: code })
      .expect(201);

    const row = await Referral.findOne({});
    await request(app)
      .post(`/api/v1/admin/rewards/referrals/${row._id}/review`)
      .set('Authorization', adminHeader)
      .send({ decision: 'REJECT', note: 'Same device as the inviter' })
      .expect(200);

    const res = await request(app)
      .post(`/api/v1/admin/rewards/referrals/${row._id}/review`)
      .set('Authorization', adminHeader)
      .send({ decision: 'APPROVE' })
      .expect(409);
    expect(res.body.error.code).toBe('REFERRAL_ALREADY_DECIDED');
    expect((await walletOf(inviter.token)).balances.VE).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('authorization & admin controls', () => {
  it('requires authentication for every reward endpoint', async () => {
    await request(app).get('/api/v1/rewards/wallet').expect(401);
    await request(app).get('/api/v1/rewards/activities').expect(401);
    await request(app).post('/api/v1/rewards/codes/redeem').send({ code: 'VELOOP100' }).expect(401);
  });

  it('refuses reward management to a non-admin account', async () => {
    const u = await signup('Plain Member');
    await request(app).get('/api/v1/admin/rewards/activities').set(auth(u.token)).expect(403);
    await request(app)
      .post('/api/v1/admin/rewards/activities')
      .set(auth(u.token))
      .send({ key: 'hack', title: 'Hack', currency: 'VE', amount: 100000 })
      .expect(403);
    await request(app).get('/api/v1/admin/rewards/stats').set(auth(u.token)).expect(403);
  });

  it('lets an admin configure an activity and generate single-use codes', async () => {
    const created = await request(app)
      .post('/api/v1/admin/rewards/activities')
      .set('Authorization', adminHeader)
      .send({
        key: `campaign-${rid()}`,
        title: 'Weekend campaign',
        description: 'Configured by an administrator',
        currency: 'TOKEN',
        amount: 75,
        claimMode: 'ONCE',
        maxClaimsPerUser: 1,
        active: true,
      })
      .expect(201);
    expect(created.body.data).toMatchObject({ currency: 'TOKEN', amount: 75, active: true });

    const generated = await request(app)
      .post('/api/v1/admin/rewards/codes/generate')
      .set('Authorization', adminHeader)
      .send({ count: 3, currency: 'VE', amount: 150, label: 'Weekend promo', prefix: 'WKND', maxRedemptions: 1 })
      .expect(201);
    expect(generated.body.data.created).toHaveLength(3);
    const codes = generated.body.data.created.map((c) => c.code);
    expect(new Set(codes).size).toBe(3);
    expect(codes.every((c) => c.startsWith('WKND'))).toBe(true);

    const stats = await request(app).get('/api/v1/admin/rewards/stats').set('Authorization', adminHeader).expect(200);
    expect(stats.body.data.activeActivities).toBeGreaterThan(0);
  });

  it('never lets an admin adjustment drive a balance negative', async () => {
    const u = await signup('Adjust Target');
    const res = await request(app)
      .post(`/api/v1/admin/rewards/wallets/${u.id}/adjust`)
      .set('Authorization', adminHeader)
      .send({ currency: 'VE', amount: 500, direction: 'DEBIT', reason: 'Attempted clawback' })
      .expect(402);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect((await walletOf(u.token)).balances.VE).toBe(0);
    const failed = await WalletTransaction.find({ userId: u.id, status: 'FAILED' }).lean();
    expect(failed).toHaveLength(1);
  });

  it('keeps one account’s balances and history invisible to another', async () => {
    const a = await signup('Owner A');
    const b = await signup('Owner B');
    await request(app).post('/api/v1/rewards/codes/redeem').set(auth(a.token)).send({ code: 'MEGA1000' }).expect(200);

    expect((await walletOf(a.token)).balances.VE).toBe(1000);
    expect((await walletOf(b.token)).balances.VE).toBe(0);
    const bHistory = await request(app).get('/api/v1/rewards/transactions').set(auth(b.token)).expect(200);
    expect(bHistory.body.data).toHaveLength(0);
  });
});
