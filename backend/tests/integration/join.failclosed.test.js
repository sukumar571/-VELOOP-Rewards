/**
 * ============================================================================
 * FAIL-CLOSED WITHOUT TRANSACTIONS — a standalone MongoDB cannot run them.
 * ============================================================================
 * A single-node `MongoMemoryServer` accepts a session but rejects the first
 * operation carrying a transaction number. On the in-DB `dev` wallet that means a
 * PAID join must FAIL CLOSED with 503 TRANSACTION_INFRASTRUCTURE_REQUIRED rather
 * than fall back to unsafe sequential writes — while a FREE join (no money) still
 * works. This is the integrity guarantee the plan makes in prose, proven here.
 * ========================================================================= */
jest.setTimeout(180000);

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

const app = require('../../src/app.js');
const models = require('../../src/models/index.js');
const { config } = require('../../src/config/index.js');
const { resetTransactionCapabilityCache } = require('../../src/config/db.js');
const { signAccessToken } = require('../../src/integrations/veloopAuth.js');

const { Giveaway, Prize, User, DevWalletBalance, GiveawayParticipation } = models;
const OVER = { overrideHistoryGuard: true };

const bearer = (claims) => `Bearer ${signAccessToken(claims)}`;
const rid = () => Math.random().toString(36).slice(2, 10);
const joinPath = (id) => `/api/v1/giveaways/${id}/join`;

let mongod;

async function createDraw({ entryAmount, freeEntryCount }) {
  const now = Date.now();
  const giveaway = await Giveaway.create({
    title: `NoTxn Draw ${rid()}`,
    slug: `notx-${rid()}`,
    startAt: new Date(now - 86_400_000),
    endAt: new Date(now + 86_400_000),
    status: 'ACTIVE',
    published: true,
    participation: { entryCurrencies: ['VE'], freeEntryCount, maxEntriesPerUser: 5, requireDeviceReference: false },
    prizeConfig: { drawMethod: 'RANDOM', claimWindowDays: 7 },
  });
  const prize = await Prize.create({
    giveawayId: giveaway._id, name: `Tier ${rid()}`, position: 1, winnerCount: 1,
    prizeType: 'PHYSICAL', claimType: 'FORM', entryCurrency: 'VE', entryAmount, claim: { windowDays: 7 },
  });
  return { giveaway, prize };
}

async function fundUser({ currency = 'VE', balance = 1_000_000 } = {}) {
  const veloopId = `nt-${rid()}`;
  const user = await User.create({ veloopId, email: `${veloopId}@example.com`, roles: ['user'], status: 'ACTIVE' });
  await DevWalletBalance.create({ userId: user._id, currency, balance });
  return { user, header: bearer({ sub: veloopId }) };
}

beforeAll(async () => {
  mongoose.set('autoIndex', false);
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('veloop_notxn_test'), { serverSelectionTimeoutMS: 10000 });
  await Promise.all(Object.values(models).map((m) => m.syncIndexes()));
  config.wallet.mode = 'dev';
  config.wallet.requireTransactionSupport = true;
  resetTransactionCapabilityCache(); // probe the standalone node → transactions unsupported
});

afterAll(async () => {
  config.wallet.mode = process.env.WALLET_MODE || 'disabled';
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  for (const Model of Object.values(models)) await Model.deleteMany({}, OVER);
  config.wallet.mode = 'dev';
  config.wallet.requireTransactionSupport = true;
  resetTransactionCapabilityCache();
});

describe('paid join fails closed when the deployment cannot transact', () => {
  it('returns 503 TRANSACTION_INFRASTRUCTURE_REQUIRED and moves no money', async () => {
    const { giveaway } = await createDraw({ entryAmount: 250, freeEntryCount: 0 });
    const { user, header } = await fundUser({ balance: 1000 });

    const res = await request(app).post(joinPath(giveaway._id)).set('Authorization', header).send({}).expect(503);
    expect(res.body.error.code).toBe('TRANSACTION_INFRASTRUCTURE_REQUIRED');

    expect(await GiveawayParticipation.countDocuments({})).toBe(0);
    const after = await DevWalletBalance.findOne({ userId: user._id, currency: 'VE' }).lean();
    expect(after.balance).toBe(1000); // untouched — no unsafe sequential debit
  });

  it('a free join still succeeds without a transaction', async () => {
    const { giveaway } = await createDraw({ entryAmount: 0, freeEntryCount: 1 });
    const { header } = await fundUser({ balance: 0 });
    const res = await request(app).post(joinPath(giveaway._id)).set('Authorization', header).send({}).expect(201);
    expect(res.body.data.participation.status).toBe('CONFIRMED');
    expect(res.body.data.pricing.charged).toBe(0);
  });

  it('an operator who explicitly relaxes the requirement gets the sequential path (201)', async () => {
    config.wallet.requireTransactionSupport = false;
    const { giveaway } = await createDraw({ entryAmount: 250, freeEntryCount: 0 });
    const { user, header } = await fundUser({ balance: 1000 });
    const res = await request(app).post(joinPath(giveaway._id)).set('Authorization', header).send({}).expect(201);
    expect(res.body.data.pricing.charged).toBe(250);
    const after = await DevWalletBalance.findOne({ userId: user._id, currency: 'VE' }).lean();
    expect(after.balance).toBe(750);
  });
});
