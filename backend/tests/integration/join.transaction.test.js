/**
 * ============================================================================
 * TRANSACTIONAL PAID-ENTRY INTEGRATION — the money path on a REAL replica set.
 * ============================================================================
 * This file deliberately uses `MongoMemoryReplSet` (not the single-node
 * `MongoMemoryServer` the other integration tests use) because the whole point is
 * to prove a paid join commits — balance debit + participation + ledger + audit —
 * as ONE MongoDB transaction, and transactions only exist on a replica set.
 *
 * The wallet is the REAL `dev` adapter (NOT mocked): its authoritative, FICTIONAL
 * balances live in `DevWalletBalance` in the same database, so the transaction
 * genuinely spans the money movement. We force `config.wallet.mode = 'dev'` at
 * runtime rather than mocking the seam, so nothing about the atomic write is faked.
 * ========================================================================= */
jest.setTimeout(240000);

const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const request = require('supertest');

const app = require('../../src/app.js');
const models = require('../../src/models/index.js');
const { config } = require('../../src/config/index.js');
const { resetTransactionCapabilityCache } = require('../../src/config/db.js');
const { signAccessToken } = require('../../src/integrations/veloopAuth.js');

const { Giveaway, Prize, User, DevWalletBalance, GiveawayParticipation, GiveawayEntryTransaction: Ledger, AuditLog, IdempotencyKey } = models;
const OVER = { overrideHistoryGuard: true };

const bearer = (claims) => `Bearer ${signAccessToken(claims)}`;
const rid = () => Math.random().toString(36).slice(2, 10);
const joinPath = (id) => `/api/v1/giveaways/${id}/join`;

let replset;

/** A published, open draw whose single tier is priced in `entryCurrency`/`entryAmount`. */
async function createDraw({ entryCurrency = 'VE', entryAmount = 250, entryCurrencies, eligibility = {}, status = 'ACTIVE' } = {}) {
  const now = Date.now();
  const giveaway = await Giveaway.create({
    title: `Tx Draw ${rid()}`,
    slug: `tx-${rid()}`,
    startAt: new Date(now - 86_400_000),
    endAt: new Date(now + 86_400_000),
    status,
    published: true,
    eligibility,
    participation: {
      entryCurrencies: entryCurrencies || [entryCurrency],
      freeEntryCount: entryAmount === 0 ? 1 : 0,
      maxEntriesPerUser: 5,
      requireDeviceReference: false,
    },
    prizeConfig: { drawMethod: 'RANDOM', claimWindowDays: 7 },
  });
  const prize = await Prize.create({
    giveawayId: giveaway._id,
    name: `Tier ${rid()}`,
    position: 1,
    winnerCount: 1,
    prizeType: entryCurrency === 'TOKEN' ? 'GIFT_CARD' : 'PHYSICAL',
    claimType: 'FORM',
    entryCurrency,
    entryAmount,
    claim: { windowDays: 7 },
  });
  return { giveaway, prize };
}

/** An ACTIVE user (identity resolves from the token `sub` -> veloopId) + a funded balance. */
async function fundUser({ veloopId = `u-${rid()}`, currency = 'VE', balance = 1_000_000 } = {}) {
  const user = await User.create({ veloopId, email: `${veloopId}@example.com`, roles: ['user'], status: 'ACTIVE' });
  await DevWalletBalance.create({ userId: user._id, currency, balance });
  return { user, header: bearer({ sub: veloopId }) };
}

const balanceOf = (userId, currency) => DevWalletBalance.findOne({ userId, currency }).lean();

beforeAll(async () => {
  mongoose.set('autoIndex', false);
  // `launchTimeout` is 10s by default; a cold wiredTiger + replica-set bootstrap on
  // Windows (Defender scanning the 64 MB mongod.exe) can exceed that, so give it 60s.
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger', launchTimeout: 60000 } });
  await mongoose.connect(replset.getUri('veloop_txn_test'), { serverSelectionTimeoutMS: 15000 });
  await Promise.all(Object.values(models).map((m) => m.syncIndexes()));

  // Force the in-DB dev wallet for the whole suite; restore afterwards.
  config.wallet.mode = 'dev';
  config.wallet.requireTransactionSupport = true;
  resetTransactionCapabilityCache(); // probe the replica set fresh
});

afterAll(async () => {
  config.wallet.mode = process.env.WALLET_MODE || 'disabled';
  await mongoose.disconnect();
  await replset.stop();
});

beforeEach(async () => {
  for (const Model of Object.values(models)) await Model.deleteMany({}, OVER);
  // The replica set DOES support transactions; make sure that is the cached verdict.
  config.wallet.mode = 'dev';
  resetTransactionCapabilityCache();
});

// ---------------------------------------------------------------------------
describe('successful paid join — one currency at a time, exactly the configured fee', () => {
  it.each([
    { currency: 'VE', amount: 250 },
    { currency: 'SVE', amount: 500 },
    { currency: 'TOKEN', amount: 2000 },
  ])('debits $currency $amount and commits participation + ledger + audit atomically', async ({ currency, amount }) => {
    const { giveaway } = await createDraw({ entryCurrency: currency, entryAmount: amount });
    const { user, header } = await fundUser({ currency, balance: amount + 1000 });

    const res = await request(app).post(joinPath(giveaway._id)).set('Authorization', header).send({}).expect(201);

    expect(res.body.data.participation.status).toBe('CONFIRMED');
    expect(res.body.data.pricing).toMatchObject({ currency, charged: amount, paidEntries: 1 });
    expect(res.body.data.balance).toMatchObject({ currency, balance: 1000 }); // (amount+1000) - amount

    // The balance really moved by exactly the configured fee.
    const after = await balanceOf(user._id, currency);
    expect(after.balance).toBe(1000);

    // A settled ledger row carrying before/after + a provider reference.
    const ledger = await Ledger.findOne({ participationId: res.body.data.participation.id || String(res.body.data.participation._id) }).lean();
    expect(ledger.status).toBe('SUCCESS');
    expect(ledger.balanceBefore).toBe(amount + 1000);
    expect(ledger.balanceAfter).toBe(1000);
    expect(ledger.externalTransactionId).toMatch(/^dev_/);

    // An audit row exists and names the transaction it committed with.
    expect(await AuditLog.countDocuments({ action: 'giveaway.entry.join' })).toBe(1);
    expect(await GiveawayParticipation.countDocuments({})).toBe(1);
  });

  it('a free entry needs no money movement and still returns 201', async () => {
    const { giveaway } = await createDraw({ entryCurrency: 'VE', entryAmount: 0 });
    const { user, header } = await fundUser({ currency: 'VE', balance: 0 });
    const res = await request(app).post(joinPath(giveaway._id)).set('Authorization', header).send({}).expect(201);
    expect(res.body.data.pricing.charged).toBe(0);
    expect(res.body.data.balance).toBeNull();
    expect(await Ledger.countDocuments({})).toBe(0);
    expect(await GiveawayParticipation.countDocuments({ userId: user._id })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('insufficient balance — fails closed, changes nothing', () => {
  it('a short account gets 402 and leaves no participation, no ledger, no debit', async () => {
    const { giveaway } = await createDraw({ entryCurrency: 'VE', entryAmount: 250 });
    const { user, header } = await fundUser({ currency: 'VE', balance: 100 });

    const res = await request(app).post(joinPath(giveaway._id)).set('Authorization', header).send({}).expect(402);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');

    expect(await GiveawayParticipation.countDocuments({})).toBe(0);
    expect(await Ledger.countDocuments({})).toBe(0);
    const after = await balanceOf(user._id, 'VE');
    expect(after.balance).toBe(100); // untouched
  });

  it('no cross-currency substitution: a VE balance cannot enter an SVE-priced tier', async () => {
    const { giveaway } = await createDraw({ entryCurrency: 'SVE', entryAmount: 500 });
    const { user, header } = await fundUser({ currency: 'VE', balance: 1_000_000 }); // funded only in VE

    // Default currency is the tier's own (SVE); there is no SVE row, so the debit is short.
    const res = await request(app).post(joinPath(giveaway._id)).set('Authorization', header).send({}).expect(402);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
    const ve = await balanceOf(user._id, 'VE');
    expect(ve.balance).toBe(1_000_000); // VE untouched
    expect(await GiveawayParticipation.countDocuments({})).toBe(0);
  });

  it('requesting a currency the tier does not price is refused outright', async () => {
    const { giveaway, prize } = await createDraw({ entryCurrency: 'SVE', entryAmount: 500, entryCurrencies: ['VE', 'SVE'] });
    const { header } = await fundUser({ currency: 'VE', balance: 1_000_000 });
    const res = await request(app)
      .post(joinPath(giveaway._id)).set('Authorization', header)
      .send({ prizeId: String(prize._id), currency: 'VE' })
      .expect(422);
    expect(res.body.error.code).toBe('ENTRY_CURRENCY_NOT_ALLOWED');
  });
});

// ---------------------------------------------------------------------------
describe('one participation per user per giveaway — the double-entry lock', () => {
  it('a second join is 409 ALREADY_JOINED and causes no second debit', async () => {
    const { giveaway } = await createDraw({ entryCurrency: 'VE', entryAmount: 250 });
    const { user, header } = await fundUser({ currency: 'VE', balance: 1000 });

    await request(app).post(joinPath(giveaway._id)).set('Authorization', header).send({}).expect(201);
    const dup = await request(app).post(joinPath(giveaway._id)).set('Authorization', header).send({}).expect(409);
    expect(dup.body.error.code).toBe('ALREADY_JOINED');

    expect(await GiveawayParticipation.countDocuments({ userId: user._id })).toBe(1);
    expect(await Ledger.countDocuments({})).toBe(1);
    expect((await balanceOf(user._id, 'VE')).balance).toBe(750); // debited once
  });

  it('simultaneous identical joins commit exactly one; the rest are 409', async () => {
    const { giveaway } = await createDraw({ entryCurrency: 'VE', entryAmount: 250 });
    const { user, header } = await fundUser({ currency: 'VE', balance: 1000 });

    const attempts = await Promise.all(
      Array.from({ length: 5 }).map(() => request(app).post(joinPath(giveaway._id)).set('Authorization', header).send({})),
    );
    const created = attempts.filter((r) => r.status === 201);
    const conflicts = attempts.filter((r) => r.status === 409);
    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(4);

    expect(await GiveawayParticipation.countDocuments({ userId: user._id })).toBe(1);
    expect(await Ledger.countDocuments({})).toBe(1);
    expect((await balanceOf(user._id, 'VE')).balance).toBe(750); // one debit total
  });
});

// ---------------------------------------------------------------------------
describe('idempotency key — a retry replays, a misuse conflicts', () => {
  it('a repeated key replays the original result and debits only once', async () => {
    const { giveaway } = await createDraw({ entryCurrency: 'VE', entryAmount: 250 });
    const { user, header } = await fundUser({ currency: 'VE', balance: 1000 });
    const key = `idem-${rid()}${rid()}`.slice(0, 40);

    const first = await request(app).post(joinPath(giveaway._id)).set('Authorization', header).set('Idempotency-Key', key).send({}).expect(201);
    const second = await request(app).post(joinPath(giveaway._id)).set('Authorization', header).set('Idempotency-Key', key).send({}).expect(201);

    expect(second.body.data.replayed).toBe(true);
    expect(second.body.data.balance.balance).toBe(first.body.data.balance.balance);

    expect(await GiveawayParticipation.countDocuments({ userId: user._id })).toBe(1);
    expect(await Ledger.countDocuments({})).toBe(1);
    expect((await balanceOf(user._id, 'VE')).balance).toBe(750);
    expect(await IdempotencyKey.countDocuments({ key })).toBe(1);
  });

  it('the same key for a different request is 409 IDEMPOTENCY_KEY_CONFLICT', async () => {
    const drawA = await createDraw({ entryCurrency: 'VE', entryAmount: 250 });
    const drawB = await createDraw({ entryCurrency: 'VE', entryAmount: 250 });
    const { header } = await fundUser({ currency: 'VE', balance: 1000 });
    const key = `conf-${rid()}${rid()}`.slice(0, 40);

    await request(app).post(joinPath(drawA.giveaway._id)).set('Authorization', header).set('Idempotency-Key', key).send({}).expect(201);
    const res = await request(app).post(joinPath(drawB.giveaway._id)).set('Authorization', header).set('Idempotency-Key', key).send({}).expect(409);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
  });

  it('a malformed key (too short) is a 400 before any write', async () => {
    const { giveaway } = await createDraw({ entryCurrency: 'VE', entryAmount: 250 });
    const { header } = await fundUser({ currency: 'VE', balance: 1000 });
    const res = await request(app).post(joinPath(giveaway._id)).set('Authorization', header).set('Idempotency-Key', 'short').send({}).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await GiveawayParticipation.countDocuments({})).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('window & eligibility gates are enforced before any money moves', () => {
  it('ended → 409 GIVEAWAY_ENDED', async () => {
    const { giveaway } = await createDraw({ entryCurrency: 'VE', entryAmount: 250 });
    giveaway.status = 'ENDED';
    giveaway.endAt = new Date(Date.now() - 1000);
    await giveaway.save();
    const { header } = await fundUser({ currency: 'VE', balance: 1000 });
    const res = await request(app).post(joinPath(giveaway._id)).set('Authorization', header).send({}).expect(409);
    expect(res.body.error.code).toBe('GIVEAWAY_ENDED');
  });

  it('upcoming → 409 GIVEAWAY_NOT_STARTED', async () => {
    const { giveaway } = await createDraw({ entryCurrency: 'VE', entryAmount: 250, status: 'UPCOMING' });
    giveaway.startAt = new Date(Date.now() + 86_400_000);
    giveaway.endAt = new Date(Date.now() + 2 * 86_400_000);
    await giveaway.save();
    const { header } = await fundUser({ currency: 'VE', balance: 1000 });
    const res = await request(app).post(joinPath(giveaway._id)).set('Authorization', header).send({}).expect(409);
    expect(res.body.error.code).toBe('GIVEAWAY_NOT_STARTED');
  });

  it('nonexistent draw → 404', async () => {
    const { header } = await fundUser({ currency: 'VE', balance: 1000 });
    const fake = new mongoose.Types.ObjectId();
    const res = await request(app).post(joinPath(fake)).set('Authorization', header).send({}).expect(404);
    expect(res.body.error.code).toBe('GIVEAWAY_NOT_FOUND');
  });

  it('an ineligible (unverifiable geo) account is refused and not charged', async () => {
    const { giveaway } = await createDraw({ entryCurrency: 'VE', entryAmount: 250, eligibility: { countries: ['IN'] } });
    const { user, header } = await fundUser({ currency: 'VE', balance: 1000 });
    const res = await request(app).post(joinPath(giveaway._id)).set('Authorization', header).send({});
    expect([403, 503]).toContain(res.status);
    expect(await GiveawayParticipation.countDocuments({})).toBe(0);
    expect((await balanceOf(user._id, 'VE')).balance).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
describe('a failure anywhere rolls the WHOLE transaction back', () => {
  it('a mid-join write failure leaves no partial charge, participation or ledger', async () => {
    const { giveaway } = await createDraw({ entryCurrency: 'VE', entryAmount: 250 });
    const { user, header } = await fundUser({ currency: 'VE', balance: 1000 });

    // Force the audit write (which runs inside the transaction) to blow up.
    const original = AuditLog.record;
    AuditLog.record = async () => { throw new Error('injected audit failure'); };
    try {
      const res = await request(app).post(joinPath(giveaway._id)).set('Authorization', header).send({});
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      AuditLog.record = original;
    }

    // The transaction aborted, so the participation + the debit are gone entirely.
    expect(await GiveawayParticipation.countDocuments({})).toBe(0);
    expect(await Ledger.countDocuments({})).toBe(0);
    expect((await balanceOf(user._id, 'VE')).balance).toBe(1000); // money restored by abort
  });

  it('a wallet-update failure persists nothing and changes no balance', async () => {
    const { giveaway } = await createDraw({ entryCurrency: 'VE', entryAmount: 250 });
    const { user, header } = await fundUser({ currency: 'VE', balance: 1000 });

    const original = DevWalletBalance.debit;
    DevWalletBalance.debit = async () => { throw new Error('injected wallet failure'); };
    try {
      const res = await request(app).post(joinPath(giveaway._id)).set('Authorization', header).send({});
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      DevWalletBalance.debit = original;
    }

    expect(await GiveawayParticipation.countDocuments({})).toBe(0);
    expect(await Ledger.countDocuments({})).toBe(0);
    expect((await balanceOf(user._id, 'VE')).balance).toBe(1000);
  });
});
