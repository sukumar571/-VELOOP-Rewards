/**
 * ============================================================================
 * ENTRY RISK ENGINE — gating the money path on a real (in-memory) MongoDB.
 * ============================================================================
 * Proves the plan's central guarantee: a corroborated REJECT returns a generic
 * 403 BEFORE any participation row is written or the wallet is debited, while a
 * lone velocity signal only FLAGS (the join still proceeds). The external wallet
 * seam is mocked so "no debit" is directly observable. Thresholds are driven
 * through runtime `config.security.fraud` (no source special-casing) and restored
 * afterwards.
 * ========================================================================= */
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
const wallet = require('../../src/integrations/veloopWallet.js');
const { config } = require('../../src/config/index.js');
const { hashReference } = require('../../src/utils/schema.js');
const { signAccessToken } = require('../../src/integrations/veloopAuth.js');

const { Giveaway, Prize, User, GiveawayParticipation, FraudEvent } = models;
const OVER = { overrideHistoryGuard: true };
const rid = () => Math.random().toString(36).slice(2, 10);

const bearer = (claims) => `Bearer ${signAccessToken(claims)}`;

// A baseline rule set with every rule OFF except the ones a test switches on.
function rulesOver(overrides) {
  return {
    enabled: true,
    rejectMinSignals: 2,
    deviceVelocity: { enabled: false, threshold: 999, severity: 'HIGH' },
    ipVelocity: { enabled: false, threshold: 999, severity: 'MEDIUM' },
    duplicateAttempts: { enabled: false, windowSec: 3600, threshold: 999, severity: 'MEDIUM' },
    participationVelocity: { enabled: false, windowSec: 3600, threshold: 999, severity: 'MEDIUM' },
    requestFrequency: { enabled: false, windowSec: 60, threshold: 999, severity: 'MEDIUM' },
    accountAge: { enabled: false, minAgeSec: 0, severity: 'LOW' },
    ...overrides,
  };
}

let mongod;
let originalFraud;

async function createUser() {
  const veloopId = `u-${rid()}`;
  const user = await User.create({ veloopId, email: `${veloopId}@example.com`, roles: ['user'], status: 'ACTIVE' });
  return { user, header: bearer({ sub: veloopId }) };
}

async function createDraw({ entryAmount = 0, freeEntryCount = entryAmount === 0 ? 1 : 0 } = {}) {
  const now = Date.now();
  const giveaway = await Giveaway.create({
    title: `Risk Draw ${rid()}`, slug: `risk-${rid()}`,
    startAt: new Date(now - 86_400_000), endAt: new Date(now + 86_400_000),
    status: 'ACTIVE', published: true, eligibility: {},
    participation: { entryCurrencies: ['VE'], freeEntryCount, maxEntriesPerUser: 5, requireDeviceReference: false },
    prizeConfig: { drawMethod: 'RANDOM', claimWindowDays: 7 },
  });
  const prize = await Prize.create({
    giveawayId: giveaway._id, name: `T ${rid()}`, position: 1, winnerCount: 1,
    prizeType: 'DIGITAL', claimType: 'DIGITAL_DELIVERY', entryCurrency: 'VE', entryAmount,
  });
  return { giveaway, prize };
}

async function seedParticipation({ userId, giveawayId, deviceHash = undefined }) {
  return GiveawayParticipation.create({
    userId, giveawayId, entryCurrency: 'VE', entryAmount: 0, entryCount: 1,
    deviceRef: deviceHash ? { deviceHash } : {}, status: 'CONFIRMED', joinedAt: new Date(),
  });
}

beforeAll(async () => {
  mongoose.set('autoIndex', false);
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('veloop_fraud_test'), { serverSelectionTimeoutMS: 10000 });
  await Promise.all(Object.values(models).map((m) => m.syncIndexes()));
  originalFraud = config.security.fraud;
});

afterAll(async () => {
  config.security.fraud = originalFraud;
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  for (const Model of Object.values(models)) await Model.deleteMany({}, OVER);
  wallet.debit.mockClear();
});

// ---------------------------------------------------------------------------
describe('risk engine gates the entry path', () => {
  it('REJECT returns a generic 403 BEFORE any participation row or debit', async () => {
    config.security.fraud = rulesOver({
      participationVelocity: { enabled: true, windowSec: 3600, threshold: 1, severity: 'MEDIUM' },
      duplicateAttempts: { enabled: true, windowSec: 3600, threshold: 1, severity: 'MEDIUM' },
    });

    const { user, header } = await createUser();
    // Two DISTINCT non-velocity categories for this account → corroborated REJECT.
    const other = await createDraw(); // some other draw the user already entered
    await seedParticipation({ userId: user._id, giveawayId: other.giveaway._id });
    await FraudEvent.create({ type: 'DUPLICATE_ATTEMPT', userId: user._id, giveawayId: other.giveaway._id, occurrenceCount: 1 });

    const { giveaway } = await createDraw({ entryAmount: 50 }); // the PAID target draw
    const res = await request(app)
      .post(`/api/v1/giveaways/${giveaway._id}/join`)
      .set('Authorization', header)
      .send({})
      .expect(403);

    expect(res.body.error.code).toBe('ENTRY_BLOCKED');
    // The generic message discloses nothing about the rule that fired.
    expect(JSON.stringify(res.body)).not.toMatch(/participationVelocity|DUPLICATE_ATTEMPT|threshold|velocity/i);
    expect(wallet.debit).not.toHaveBeenCalled();
    expect(await GiveawayParticipation.countDocuments({ giveawayId: giveaway._id })).toBe(0);
    const blocked = await FraudEvent.find({ userId: user._id, giveawayId: giveaway._id, actionTaken: 'ENTRY_BLOCKED' });
    expect(blocked.length).toBeGreaterThan(0);
  });

  it('a lone device-velocity signal only FLAGS — the (free) join still proceeds', async () => {
    config.security.fraud = rulesOver({
      deviceVelocity: { enabled: true, threshold: 2, severity: 'HIGH' },
    });

    const { giveaway } = await createDraw({ entryAmount: 0, freeEntryCount: 1 });
    const shared = hashReference('shared-device-xyz');
    // Two OTHER accounts already entered this draw from the same device.
    await seedParticipation({ userId: new mongoose.Types.ObjectId(), giveawayId: giveaway._id, deviceHash: shared });
    await seedParticipation({ userId: new mongoose.Types.ObjectId(), giveawayId: giveaway._id, deviceHash: shared });

    const { header } = await createUser();
    const res = await request(app)
      .post(`/api/v1/giveaways/${giveaway._id}/join`)
      .set('Authorization', header)
      .send({ deviceReference: 'shared-device-xyz' })
      .expect(201);
    expect(res.body.data.participation.status).toBe('CONFIRMED');

    const flagged = await FraudEvent.findOne({ giveawayId: giveaway._id, actionTaken: 'FLAGGED', type: 'DEVICE_VELOCITY' });
    expect(flagged).not.toBeNull();
  });

  it('a disabled engine never blocks and records no decision event', async () => {
    config.security.fraud = rulesOver({
      enabled: false,
      participationVelocity: { enabled: true, windowSec: 3600, threshold: 1, severity: 'MEDIUM' },
      duplicateAttempts: { enabled: true, windowSec: 3600, threshold: 1, severity: 'MEDIUM' },
    });

    const { user, header } = await createUser();
    const other = await createDraw();
    await seedParticipation({ userId: user._id, giveawayId: other.giveaway._id });
    await FraudEvent.create({ type: 'DUPLICATE_ATTEMPT', userId: user._id, giveawayId: other.giveaway._id, occurrenceCount: 1 });

    const { giveaway } = await createDraw({ entryAmount: 50 });
    await request(app).post(`/api/v1/giveaways/${giveaway._id}/join`).set('Authorization', header).send({}).expect(201);

    expect(wallet.debit).toHaveBeenCalledTimes(1);
    expect(await FraudEvent.countDocuments({ giveawayId: giveaway._id, actionTaken: { $in: ['ENTRY_BLOCKED', 'FLAGGED'] } })).toBe(0);
  });
});
