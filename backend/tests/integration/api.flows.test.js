/**
 * ============================================================================
 * END-TO-END API FLOWS — real HTTP against a REAL (in-memory) MongoDB.
 * ============================================================================
 * The contract tests prove the surface without a database; these prove the
 * behaviour WITH one: pagination over real rows, the DB-unique double-entry
 * lock, the money path, the CSPRNG draw, one-way publication, masked winners and
 * the claim lifecycle. The ONLY thing mocked is the external wallet seam
 * (`veloopWallet`) — no real wallet service exists in this workspace, and the
 * adapter documents that as an integration requirement rather than faking it.
 * ========================================================================= */
jest.setTimeout(180000);

// Mock the external wallet before any service imports it.
jest.mock('../../src/integrations/veloopWallet.js', () => ({
  isConfigured: jest.fn(() => true),
  mode: jest.fn(() => 'http'),
  getBalance: jest.fn(async ({ userId, currency }) => ({
    userId: String(userId), currency, balance: 1_000_000, observedAt: new Date(), source: 'VELOOP_API',
  })),
  debit: jest.fn(async () => ({ status: 'SUCCESS', externalTransactionId: 'ext-1', balanceBefore: 1000, balanceAfter: 950 })),
  reverse: jest.fn(async () => ({ status: 'SUCCESS', externalTransactionId: 'rev-1', balanceAfter: 1000 })),
}));

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

const app = require('../../src/app.js');
const models = require('../../src/models/index.js');
const wallet = require('../../src/integrations/veloopWallet.js');
const { hashReference } = require('../../src/utils/schema.js');
const { signAccessToken } = require('../../src/integrations/veloopAuth.js');

const { Giveaway, Prize } = models;
const OVER = { overrideHistoryGuard: true };

const bearer = (claims) => `Bearer ${signAccessToken(claims)}`;
const adminHeader = bearer({ sub: 'admin-1', roles: ['admin'] });
const userHeaderFor = (sub) => bearer({ sub });
const rid = () => Math.random().toString(36).slice(2, 10);

let mongod;

async function createGiveaway(opts = {}) {
  const now = Date.now();
  const startAt = opts.startAt || new Date(now - 86_400_000);
  const endAt = opts.endAt || new Date(now + 86_400_000);
  const giveaway = await Giveaway.create({
    title: opts.title || 'Flow Draw',
    slug: `flow-${rid()}`,
    startAt,
    endAt,
    status: opts.status || 'ACTIVE',
    published: opts.published !== undefined ? opts.published : true,
    participation: { entryCurrencies: ['VE'], maxEntriesPerUser: 5, freeEntryCount: opts.freeEntryCount || 0, requireDeviceReference: false },
    prizeConfig: { drawMethod: 'RANDOM', allowDuplicateWinners: false, claimWindowDays: opts.claimWindowDays || 7 },
  });
  const prize = await Prize.create({
    giveawayId: giveaway._id,
    name: 'Prize',
    position: 1,
    winnerCount: opts.winnerCount || 1,
    prizeType: opts.prizeType || 'DIGITAL',
    claimType: opts.claimType || 'DIGITAL_DELIVERY',
    entryCurrency: 'VE',
    entryAmount: opts.entryAmount || 0,
  });
  return { giveaway, prize };
}

beforeAll(async () => {
  mongoose.set('autoIndex', false);
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('veloop_flow_test'), { serverSelectionTimeoutMS: 10000 });
  // Real indexes so the database — not just application code — enforces the
  // unique participation and prize-position invariants the flows rely on.
  await Promise.all(Object.values(models).map((m) => m.syncIndexes()));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  for (const Model of Object.values(models)) await Model.deleteMany({}, OVER);
  wallet.isConfigured.mockClear();
  wallet.getBalance.mockClear();
  wallet.debit.mockClear();
  wallet.reverse.mockClear();
  wallet.isConfigured.mockReturnValue(true);
  // Echo the REAL subject id (a valid ObjectId) the way the live adapter does —
  // a fixed placeholder would make WalletReference.recordSnapshot cast-fail.
  wallet.getBalance.mockImplementation(async ({ userId, currency }) => ({
    userId: String(userId), currency, balance: 1_000_000, observedAt: new Date(), source: 'VELOOP_API',
  }));
  wallet.debit.mockResolvedValue({ status: 'SUCCESS', externalTransactionId: 'ext-1', balanceBefore: 1000, balanceAfter: 950 });
});

// ---------------------------------------------------------------------------
describe('public reads against real data', () => {
  it('lists published draws, paginated, and hides unpublished ones from the public', async () => {
    await createGiveaway({ title: 'Open A' });
    await createGiveaway({ title: 'Ended', status: 'ENDED' });
    const draft = await createGiveaway({ title: 'Draft', published: false, status: 'UPCOMING' });

    const anon = await request(app).get('/api/v1/giveaways?limit=50').expect(200);
    const titles = anon.body.data.map((g) => g.title);
    expect(titles).toContain('Open A');
    expect(titles).toContain('Ended');
    expect(titles).not.toContain('Draft');
    expect(anon.body.meta).toMatchObject({ limit: 50 });

    // The draft exists only for an admin.
    await request(app).get(`/api/v1/giveaways/${draft.giveaway.id || draft.giveaway._id}`).expect(404);
    const asAdmin = await request(app)
      .get(`/api/v1/giveaways/${draft.giveaway._id}`)
      .set('Authorization', adminHeader)
      .expect(200);
    expect(asAdmin.body.data.published).toBe(false);
  });

  it('current returns the open draw and previous the finished one', async () => {
    const open = await createGiveaway({ title: 'Live Now', status: 'ACTIVE' });
    const past = await createGiveaway({ title: 'Last Month', status: 'ENDED', endAt: new Date(Date.now() - 1000) });

    const cur = await request(app).get('/api/v1/giveaways/current').expect(200);
    expect(cur.body.data.title).toBe('Live Now');
    const prev = await request(app).get('/api/v1/giveaways/previous').expect(200);
    const prevTitles = [].concat(prev.body.data).map((g) => g.title);
    expect(prevTitles).toContain('Last Month');
    void past;
    void open;
  });

  it('never leaks internal bookkeeping fields in a public read', async () => {
    const { giveaway } = await createGiveaway();
    const res = await request(app).get(`/api/v1/giveaways/${giveaway._id}`).expect(200);
    expect(res.body.data._id).toBeUndefined();
    expect(res.body.data.id).toBe(String(giveaway._id));
    expect(JSON.stringify(res.body)).not.toMatch(/__v|seedBatch/);
  });
});

// ---------------------------------------------------------------------------
describe('entry flow (free + paid) against real data', () => {
  it('a free join creates a confirmed participation, then blocks a duplicate', async () => {
    const { giveaway } = await createGiveaway({ freeEntryCount: 1 });
    const h = userHeaderFor(`joiner-${rid()}`);

    const joined = await request(app).post(`/api/v1/giveaways/${giveaway._id}/join`).set('Authorization', h).send({}).expect(201);
    expect(joined.body.data.participation.status).toBe('CONFIRMED');
    expect(joined.body.data.pricing).toMatchObject({ charged: 0, currency: 'VE' });

    const dup = await request(app).post(`/api/v1/giveaways/${giveaway._id}/join`).set('Authorization', h).send({}).expect(409);
    expect(dup.body.error.code).toBe('ALREADY_JOINED');

    const mine = await request(app).get('/api/v1/giveaways/my-status').set('Authorization', h).expect(200);
    expect(mine.body.data).toHaveLength(1);
  });

  it('rejects entry to a draw that has ended', async () => {
    const { giveaway } = await createGiveaway({ status: 'ENDED', endAt: new Date(Date.now() - 1000) });
    const res = await request(app)
      .post(`/api/v1/giveaways/${giveaway._id}/join`)
      .set('Authorization', userHeaderFor(`late-${rid()}`))
      .send({})
      .expect(409);
    expect(res.body.error.code).toBe('GIVEAWAY_ENDED');
  });

  it('charges a paid entry through the wallet seam', async () => {
    const { giveaway } = await createGiveaway({ entryAmount: 50 });
    const res = await request(app)
      .post(`/api/v1/giveaways/${giveaway._id}/join`)
      .set('Authorization', userHeaderFor(`payer-${rid()}`))
      .send({})
      .expect(201);
    expect(res.body.data.pricing).toMatchObject({ charged: 50, paidEntries: 1 });
    expect(wallet.debit).toHaveBeenCalled();
  });

  it('a broke account gets INSUFFICIENT_BALANCE and leaves no entry behind', async () => {
    wallet.getBalance.mockImplementation(async ({ userId, currency }) => ({
      userId: String(userId), currency, balance: 5, observedAt: new Date(), source: 'VELOOP_API',
    }));
    const { giveaway } = await createGiveaway({ entryAmount: 50 });
    const res = await request(app)
      .post(`/api/v1/giveaways/${giveaway._id}/join`)
      .set('Authorization', userHeaderFor(`broke-${rid()}`))
      .send({})
      .expect(402);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect(await models.GiveawayParticipation.countDocuments({})).toBe(0);
  });

  it('an unconfigured wallet on a paid draw is an honest 503, never a fake charge', async () => {
    wallet.isConfigured.mockReturnValue(false);
    const { giveaway } = await createGiveaway({ entryAmount: 50 });
    const res = await request(app)
      .post(`/api/v1/giveaways/${giveaway._id}/join`)
      .set('Authorization', userHeaderFor(`nowallet-${rid()}`))
      .send({})
      .expect(503);
    expect(res.body.error.code).toBe('WALLET_NOT_CONFIGURED');
    expect(wallet.debit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('admin lifecycle → draw → publish → claim', () => {
  it('runs the whole operator flow end to end', async () => {
    const startAt = new Date(Date.now() - 3600_000).toISOString();
    const endAt = new Date(Date.now() + 3600_000).toISOString();

    // 1) Create a draw (UPCOMING, unpublished by default).
    const created = await request(app)
      .post('/api/v1/admin/giveaways')
      .set('Authorization', adminHeader)
      .send({ title: 'Managed Draw', slug: `managed-${rid()}`, startAt, endAt, participation: { entryCurrencies: ['VE'], maxEntriesPerUser: 5, requireDeviceReference: false }, prizeConfig: { drawMethod: 'RANDOM', claimWindowDays: 7 } })
      .expect(201);
    const gid = created.body.data.id;

    // 2) Add a free DIGITAL prize tier.
    const prizeRes = await request(app)
      .post(`/api/v1/admin/giveaways/${gid}/prizes`)
      .set('Authorization', adminHeader)
      .send({ name: 'Code', position: 1, winnerCount: 1, prizeType: 'DIGITAL', claimType: 'DIGITAL_DELIVERY', entryCurrency: 'VE', entryAmount: 0 })
      .expect(201);
    const prizeId = prizeRes.body.data.id;

    // 3) Publish and activate.
    await request(app).post(`/api/v1/admin/giveaways/${gid}/publish`).set('Authorization', adminHeader).send({ published: true }).expect(200);
    await request(app).post(`/api/v1/admin/giveaways/${gid}/transition`).set('Authorization', adminHeader).send({ status: 'ACTIVE' }).expect(200);

    // 4) A user enters (free).
    const winnerSub = `winner-${rid()}`;
    await request(app).post(`/api/v1/giveaways/${gid}/join`).set('Authorization', userHeaderFor(winnerSub)).send({}).expect(201);

    // 5) Draw is refused while entries are open, allowed once ended.
    await request(app).post(`/api/v1/admin/giveaways/${gid}/winners/draw`).set('Authorization', adminHeader).send({ prizeId }).expect(409);
    await request(app).post(`/api/v1/admin/giveaways/${gid}/transition`).set('Authorization', adminHeader).send({ status: 'ENDED' }).expect(200);

    const drawn = await request(app).post(`/api/v1/admin/giveaways/${gid}/winners/draw`).set('Authorization', adminHeader).send({ prizeId }).expect(201);
    expect(drawn.body.data.drawn).toHaveLength(1);
    const claimIdFromDraw = drawn.body.data.drawn[0].claimId;

    // 6) Notify (private, 202) then publish (one-way, masked).
    await request(app).post(`/api/v1/admin/giveaways/${gid}/winners/notify`).set('Authorization', adminHeader).send({}).expect(202);
    await request(app).post(`/api/v1/admin/giveaways/${gid}/winners/publish`).set('Authorization', adminHeader).send({}).expect(200);

    const publicWinners = await request(app).get(`/api/v1/giveaways/${gid}/winners`).expect(200);
    const rows = publicWinners.body.data.items;
    expect(rows).toHaveLength(1);
    expect(rows[0].display.displayAlias).toMatch(/Member #/);
    // No private user detail on the public winners surface.
    expect(rows[0]).not.toHaveProperty('userId');
    expect(JSON.stringify(publicWinners.body)).not.toMatch(winnerSub);

    // 7) The winner sees and submits their claim.
    const claims = await request(app).get('/api/v1/claims').set('Authorization', userHeaderFor(winnerSub)).expect(200);
    expect(claims.body.data).toHaveLength(1);
    const claimId = claims.body.data[0].id;
    expect(claimId).toBe(claimIdFromDraw);
    await request(app)
      .post(`/api/v1/claims/${claimId}/submit`)
      .set('Authorization', userHeaderFor(winnerSub))
      .send({ fulfillment: { digital: { deliveryEmail: 'winner@example.com' } } })
      .expect(201);

    // 8) The operator reviews it to completion.
    await request(app).post(`/api/v1/admin/claims/${claimId}/review`).set('Authorization', adminHeader).send({ status: 'PROCESSING' }).expect(200);
    const done = await request(app).post(`/api/v1/admin/claims/${claimId}/review`).set('Authorization', adminHeader).send({ status: 'COMPLETED' }).expect(200);
    expect(done.body.data.status).toBe('COMPLETED');

    // 9) The audit trail recorded the draw and reviews (references, not PII).
    const audit = await request(app).get('/api/v1/admin/audit-logs?limit=50').set('Authorization', adminHeader).expect(200);
    expect(audit.body.data.some((a) => a.action === 'giveaway.winners.draw')).toBe(true);
    expect(JSON.stringify(audit.body)).not.toMatch(/winner@example\.com/);
  });

  it('refuses a second decision on a terminal fraud event', async () => {
    const event = await models.FraudEvent.create({ type: 'DEVICE_VELOCITY', deviceHash: hashReference('device-abc') });
    await request(app).post(`/api/v1/admin/fraud-events/${event._id}/decision`).set('Authorization', adminHeader).send({ decision: 'CONFIRMED', note: 'confirmed' }).expect(200);
    const res = await request(app).post(`/api/v1/admin/fraud-events/${event._id}/decision`).set('Authorization', adminHeader).send({ decision: 'DISMISSED', note: 'again' }).expect(409);
    expect(res.body.error.code).toBe('FRAUD_EVENT_DECIDED');
  });
});
