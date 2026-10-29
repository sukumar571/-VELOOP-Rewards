/**
 * ============================================================================
 * MODEL / INDEX INTEGRATION TESTS — run against a REAL MongoDB
 * ============================================================================
 * These are the proofs the unit tests cannot give: that the indexes are actually
 * created in the database, that a duplicate participation is actually rejected by
 * the server (not just by application code), and that the ledger/immutability/
 * deletion rules behave under real writes.
 *
 * A `mongodb-memory-server` instance is started on demand, so no external service
 * or credential is needed. `autoIndex` is switched OFF before connecting, which is
 * what makes the "index creation" test meaningful: indexes can only appear because
 * the migration runner created them.
 * ========================================================================= */
jest.setTimeout(180000);

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const models = require('../../src/models/index.js');
const { runMigration } = require('../../scripts/migrate.js');

const {
  User,
  Giveaway,
  Prize,
  GiveawayParticipation,
  GiveawayEntryTransaction,
  GiveawayWinner,
  PrizeClaim,
  FraudEvent,
  WalletReference,
  AuditLog,
} = models;
const { hashReference } = require('../../src/utils/schema.js');

const OVER = { overrideHistoryGuard: true }; // documented dev/test escape hatch
let mongod;
let dbUri;

/**
 * The seed/reset scripts close the connection when they finish (they are CLI entry
 * points), while scriptDb.connect() reuses whatever connection is already open.
 * So the test hands the shared connection back after each script call.
 */
async function ensureConnected() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(dbUri, { serverSelectionTimeoutMS: 10000 });
  }
}

/** Creates a giveaway + tier + user triple with sensible, valid defaults. */
async function makeScenario({ winnerCount = 2, prizeCount = 1, users = 1, status = 'ACTIVE' } = {}) {
  const startAt = new Date(Date.now() - 86_400_000);
  const endAt = new Date(Date.now() + 86_400_000);
  const giveaway = await Giveaway.create({
    title: 'Test Draw',
    slug: `test-draw-${Math.random().toString(36).slice(2, 10)}`,
    startAt,
    endAt,
    status,
    published: true,
    participation: { entryCurrencies: ['VE', 'TOKEN'], maxEntriesPerUser: 5 },
    prizeConfig: { drawMethod: 'RANDOM', allowDuplicateWinners: false },
  });
  const prizes = [];
  for (let i = 1; i <= prizeCount; i += 1) {
    prizes.push(
      await Prize.create({
        giveawayId: giveaway._id,
        name: `Tier ${i}`,
        position: i,
        winnerCount,
        prizeType: 'PHYSICAL',
        claimType: 'FORM',
        entryCurrency: 'VE',
        entryAmount: 50,
      }),
    );
  }
  const people = [];
  for (let i = 1; i <= users; i += 1) {
    people.push(await User.create({ veloopId: `u-${Math.random().toString(36).slice(2, 10)}`, publicAlias: 'Member #0001' }));
  }
  return { giveaway, prizes, people };
}

const participationFor = (user, giveaway, extra = {}) => ({
  userId: user._id,
  giveawayId: giveaway._id,
  entryCurrency: 'VE',
  entryAmount: 50,
  deviceRef: { deviceHash: hashReference('device-1') },
  ...extra,
});

beforeAll(async () => {
  mongoose.set('autoIndex', false); // indexes must arrive only through the migration
  mongod = await MongoMemoryServer.create();
  dbUri = mongod.getUri('veloop_model_test');
  await mongoose.connect(dbUri, { serverSelectionTimeoutMS: 10000 });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  for (const Model of Object.values(models)) {
    await Model.deleteMany({}, OVER);
  }
});

describe('index creation (migration runner)', () => {
  it('--check reports missing indexes and creates nothing', async () => {
    const lines = [];
    const result = await runMigration({ checkOnly: true, log: (l) => lines.push(l) });
    expect(result.report).toHaveLength(Object.keys(models).length);
    expect(result.report.every((r) => r.mode === 'check')).toBe(true);
    // Nothing was declared before, so every collection must still be bare.
    const indexes = await GiveawayParticipation.collection.indexes();
    expect(indexes.filter((i) => i.name !== '_id_')).toHaveLength(0);
    // And the report says so instead of crashing on a namespace that has no
    // indexes yet (the normal state of a brand-new database).
    expect(result.report.every((r) => r.actual === 0 && r.missing === r.declared)).toBe(true);
  });

  it('creates every declared index, including the unique participation index', async () => {
    await runMigration({ log: () => {} });
    const indexes = await GiveawayParticipation.collection.indexes();
    const unique = indexes.find((i) => i.unique && JSON.stringify(i.key) === JSON.stringify({ userId: 1, giveawayId: 1 }));
    expect(unique).toBeTruthy();
    // The other database-level invariants of the specification.
    expect((await GiveawayEntryTransaction.collection.indexes()).some((i) => i.unique && i.key.idempotencyKey === 1)).toBe(true);
    expect((await GiveawayWinner.collection.indexes()).some((i) => i.unique && i.key.prizeId === 1 && i.key.rank === 1)).toBe(true);
    expect((await Prize.collection.indexes()).some((i) => i.unique && i.key.giveawayId === 1 && i.key.position === 1)).toBe(true);
    expect((await WalletReference.collection.indexes()).some((i) => i.unique && i.key.userId === 1 && i.key.currency === 1)).toBe(true);
    expect((await User.collection.indexes()).some((i) => i.unique && i.key.veloopId === 1)).toBe(true);
    expect((await Giveaway.collection.indexes()).some((i) => i.unique && i.key.slug === 1)).toBe(true);
  });

  it('is idempotent and keeps the schema and the database in agreement', async () => {
    await runMigration({ log: () => {} });
    const second = await runMigration({ log: () => {} });
    expect(second.created).toBe(0);
    expect(second.dropped).toBe(0);
    const check = await runMigration({ checkOnly: true, log: () => {} });
    expect(check.report.every((r) => r.missing === 0)).toBe(true);
  });

  it('drops an index that is no longer declared (schema is the source of truth)', async () => {
    await GiveawayParticipation.collection.createIndex({ voidReason: 1 }, { name: 'no_longer_declared' });
    const before = (await GiveawayParticipation.collection.indexes()).some((i) => i.name === 'no_longer_declared');
    expect(before).toBe(true);
    await runMigration({ log: () => {} });
    const after = (await GiveawayParticipation.collection.indexes()).some((i) => i.name === 'no_longer_declared');
    expect(after).toBe(false);
  });

  it('applies the fraud retention policy only when it is configured', async () => {
    // A TTL index over `null` would expire nothing, so the policy must also name
    // the moment each aged row becomes removable. Real writes, real database.
    const aged = await FraudEvent.create({ type: 'DEVICE_VELOCITY', deviceHash: hashReference('device-old') });
    const fresh = await FraudEvent.create({ type: 'DEVICE_VELOCITY', deviceHash: hashReference('device-new') });
    const fortyDaysAgo = new Date(Date.now() - 40 * 86_400_000);
    // Direct collection writes: these rows model history, not a new save path.
    await FraudEvent.collection.updateOne({ _id: aged._id }, { $set: { lastSeenAt: fortyDaysAgo, expiresAt: null } });
    await FraudEvent.collection.updateOne({ _id: fresh._id }, { $set: { expiresAt: null } });

    process.env.FRAUD_RETENTION_DAYS = '30';
    const result = await runMigration({ log: () => {} });
    const ttl = (await FraudEvent.collection.indexes()).find((i) => i.name === 'ttl_expiresAt');
    expect(ttl).toBeTruthy();
    expect(ttl.expireAfterSeconds).toBe(0); // expiry is driven by expiresAt
    expect(result.retention).toMatchObject({ days: 30, indexed: true, stamped: 1 });

    const stamped = await FraudEvent.findById(aged._id).lean();
    expect(stamped.expiresAt).toBeInstanceOf(Date);
    expect(stamped.expiresAt.getTime()).toBe(fortyDaysAgo.getTime() + 30 * 86_400_000);
    // A row still inside the retention window is not scheduled for deletion.
    await expect(FraudEvent.findById(fresh._id).lean()).resolves.toMatchObject({ expiresAt: null });

    // Running it again changes nothing (idempotent policy).
    const again = await runMigration({ log: () => {} });
    expect(again.retention).toMatchObject({ days: 30, indexed: true, stamped: 0 });
    delete process.env.FRAUD_RETENTION_DAYS;
  });
});

describe('one participation per user per event (database-enforced)', () => {
  it('rejects a second participation row for the same user in the same giveaway', async () => {
    const { giveaway, people } = await makeScenario({ users: 1 });
    await GiveawayParticipation.create(participationFor(people[0], giveaway));

    const err = await GiveawayParticipation.create(participationFor(people[0], giveaway)).catch((e) => e);
    expect(err).toBeTruthy();
    expect(err.code).toBe(11000); // E11000 duplicate key — rejected by MongoDB itself
    expect(await GiveawayParticipation.countDocuments()).toBe(1);
  });

  it('survives a concurrent double-submit: exactly one row wins', async () => {
    const { giveaway, people } = await makeScenario({ users: 1 });
    const results = await Promise.allSettled(
      [1, 2, 3].map(() => GiveawayParticipation.create(participationFor(people[0], giveaway))),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await GiveawayParticipation.countDocuments()).toBe(1);
  });

  it('a new giveaway always accepts new participation records', async () => {
    const a = await makeScenario({ users: 2 });
    const b = await makeScenario({ users: 2 });
    await GiveawayParticipation.create(participationFor(a.people[0], a.giveaway));
    // Same user, different event: the index is scoped per giveaway, so this is fine.
    await GiveawayParticipation.create(participationFor(a.people[0], b.giveaway));
    // Different user, same event: also fine.
    await GiveawayParticipation.create(participationFor(b.people[1], b.giveaway));
    expect(await GiveawayParticipation.countDocuments()).toBe(3);
  });

  it('extra paid entries extend the existing row through the ledger, not new rows', async () => {
    const { giveaway, people } = await makeScenario({ users: 1 });
    const participation = await GiveawayParticipation.create(participationFor(people[0], giveaway, { entryCount: 1 }));
    const charge = async (key, balanceBefore, balanceAfter, external) =>
      GiveawayEntryTransaction.create({
        userId: people[0]._id,
        giveawayId: giveaway._id,
        participationId: participation._id,
        currency: 'VE',
        amount: 50,
        direction: 'DEBIT',
        type: 'ENTRY_FEE',
        status: 'SUCCESS',
        externalTransactionId: external,
        balanceBefore,
        balanceAfter,
        idempotencyKey: key,
        entriesGranted: 1,
      });
    const second = await charge('entry:2', 450, 400, 'ext-2');
    participation.entryCount = 2;
    participation.transactionIds = [second._id];
    await participation.save();

    expect(await GiveawayParticipation.countDocuments()).toBe(1);
    expect(await GiveawayEntryTransaction.countDocuments()).toBe(1);
    const reloaded = await GiveawayParticipation.findById(participation._id);
    expect(reloaded.entryCount).toBe(2);
  });

  it('keeps a charged participation immutable and undeletable', async () => {
    const { giveaway, people } = await makeScenario({ users: 1 });
    const txn = await GiveawayEntryTransaction.create({
      userId: people[0]._id, giveawayId: giveaway._id, currency: 'VE', amount: 50, direction: 'DEBIT',
      type: 'ENTRY_FEE', status: 'PENDING', idempotencyKey: 'entry:once',
    });
    const participation = await GiveawayParticipation.create(
      participationFor(people[0], giveaway, { status: 'CONFIRMED', transactionId: txn._id }),
    );

    participation.giveawayId = (await Giveaway.create({
      title: 'Swap Attempt', slug: 'swap-attempt', startAt: new Date(), endAt: new Date(Date.now() + 1000),
    }))._id;
    await expect(participation.save()).rejects.toThrow(/IMMUTABLE_FIELD/);
    await expect(participation.deleteOne()).rejects.toThrow(/HISTORY_PROTECTED/);
  });

  it('a never-charged pending row may be removed (failed-submit cleanup), a confirmed one may not', async () => {
    const { giveaway, people } = await makeScenario({ users: 2 });
    const pending = await GiveawayParticipation.create(
      participationFor(people[0], giveaway, { status: 'PENDING' }),
    );
    await pending.deleteOne(); // `unless` branch of the delete guard
    expect(await GiveawayParticipation.countDocuments()).toBe(0);

    const confirmed = await GiveawayParticipation.create(
      participationFor(people[1], giveaway, { status: 'CONFIRMED' }),
    );
    await expect(confirmed.deleteOne()).rejects.toThrow(/HISTORY_PROTECTED/);
  });

  it('refuses to revive a participation already voided for fraud', async () => {
    const { giveaway, people } = await makeScenario({ users: 1 });
    const doc = await GiveawayParticipation.create(participationFor(people[0], giveaway));
    doc.status = 'VOIDED_FRAUD';
    doc.voidReason = 'device cluster';
    await doc.save();

    doc.status = 'CONFIRMED';
    await expect(doc.save()).rejects.toThrow(/terminal status cannot change/);
  });
});

describe('prize configuration is data, and the database enforces the tiers', () => {
  it('two tiers cannot share a position inside one giveaway', async () => {
    const { giveaway } = await makeScenario({ prizeCount: 1 });
    const err = await Prize.create({
      giveawayId: giveaway._id, name: 'Clash', position: 1, winnerCount: 1,
      prizeType: 'GIFT_CARD', claimType: 'DIGITAL_DELIVERY', entryCurrency: 'VE', entryAmount: 25,
    }).catch((e) => e);
    expect(err.code).toBe(11000);
  });

  it('the same position is free in a different giveaway', async () => {
    const a = await makeScenario({ prizeCount: 1 });
    const b = await makeScenario({ prizeCount: 1 });
    expect(a.giveaway._id.toString()).not.toBe(b.giveaway._id.toString());
    expect(await Prize.countDocuments({ position: 1 })).toBe(2);
  });

  it('a fee currency the event does not enable is refused before writing', async () => {
    const { giveaway } = await makeScenario({ prizeCount: 1 });
    expect(() =>
      Prize.assertMatchesGiveaway(giveaway, { entryCurrency: 'SVE' }),
    ).toThrow(/PRIZE_FEE_POLICY/);
    expect(Prize.assertMatchesGiveaway(giveaway, { entryCurrency: 'TOKEN' })).toBe(true);
  });

  it('a prize that produced winners cannot be deleted, only retired', async () => {
    const { giveaway, prizes, people } = await makeScenario({ winnerCount: 1, users: 1 });
    await GiveawayParticipation.create(participationFor(people[0], giveaway));
    await GiveawayWinner.create({
      giveawayId: giveaway._id, prizeId: prizes[0]._id, userId: people[0]._id, rank: 1,
      selection: { method: 'RANDOM' },
    });
    await expect(prizes[0].deleteOne()).rejects.toThrow(/HISTORY_PROTECTED/);
  });
});

describe('entry transaction ledger behaviour', () => {
  const settledCharge = (over = {}) => ({
    userId: new mongoose.Types.ObjectId(),
    giveawayId: new mongoose.Types.ObjectId(),
    currency: 'VE',
    amount: 50,
    direction: 'DEBIT',
    type: 'ENTRY_FEE',
    status: 'SUCCESS',
    externalTransactionId: `ext-${Math.random().toString(36).slice(2, 10)}`,
    balanceBefore: 500,
    balanceAfter: 450,
    idempotencyKey: `entry-${Math.random().toString(36).slice(2, 10)}`,
    ...over,
  });

  it('a replayed idempotency key cannot create a second charge', async () => {
    const row = settledCharge({ idempotencyKey: 'same-key' });
    await GiveawayEntryTransaction.create(row);
    const err = await GiveawayEntryTransaction.create({ ...settledCharge(), idempotencyKey: 'same-key' }).catch((e) => e);
    expect(err.code).toBe(11000);
    expect(await GiveawayEntryTransaction.countDocuments()).toBe(1);
  });

  it('the provider reference is unique when present, and unconstrained when absent', async () => {
    await GiveawayEntryTransaction.create(settledCharge({ externalTransactionId: 'ext-shared', idempotencyKey: 'k1' }));
    const dup = await GiveawayEntryTransaction
      .create(settledCharge({ externalTransactionId: 'ext-shared', idempotencyKey: 'k2' }))
      .catch((e) => e);
    expect(dup.code).toBe(11000);

    // Two PENDING rows legitimately have no provider reference yet (partial index).
    await GiveawayEntryTransaction.create(settledCharge({ status: 'PENDING', externalTransactionId: null, balanceBefore: null, balanceAfter: null, idempotencyKey: 'k3' }));
    await GiveawayEntryTransaction.create(settledCharge({ status: 'PENDING', externalTransactionId: null, balanceBefore: null, balanceAfter: null, idempotencyKey: 'k4' }));
    expect(await GiveawayEntryTransaction.countDocuments()).toBe(3);
  });

  it('walks PENDING -> SUCCESS and refuses any other rewrite of a settled row', async () => {
    const txn = await GiveawayEntryTransaction.create(settledCharge({ status: 'PENDING', externalTransactionId: null, balanceBefore: null, balanceAfter: null }));
    txn.status = 'SUCCESS';
    txn.externalTransactionId = 'ext-final';
    txn.balanceBefore = 500;
    txn.balanceAfter = 450;
    await txn.save();
    expect(txn.completedAt).toBeInstanceOf(Date);

    txn.status = 'FAILED';
    await expect(txn.save()).rejects.toThrow(/Illegal ledger transition SUCCESS -> FAILED/);
  });

  it('a settled charge cannot be edited into a refund, nor deleted', async () => {
    const txn = await GiveawayEntryTransaction.create(settledCharge());
    // Re-writing the identity of a settled row is what a fake "refund" looks like.
    txn.idempotencyKey = 'rewritten-key';
    await expect(txn.save()).rejects.toThrow(/IMMUTABLE_FIELD/);
    txn.amount = 1; // and the arithmetic check catches the balance version of it
    await expect(txn.save()).rejects.toThrow(/does not reconcile|IMMUTABLE_FIELD/);
    await expect(txn.deleteOne()).rejects.toThrow(/HISTORY_PROTECTED/);
    const reloaded = await GiveawayEntryTransaction.findById(txn._id);
    expect(reloaded.amount).toBe(50);
    expect(reloaded.idempotencyKey).not.toBe('rewritten-key');
  });

  it('rejects a charge whose balances do not reconcile', async () => {
    const err = await GiveawayEntryTransaction
      .create(settledCharge({ balanceAfter: 400, idempotencyKey: 'bad-math' }))
      .catch((e) => e);
    expect(err.message).toMatch(/does not reconcile/);
  });

  it('a refund is a NEW compensating row, created PENDING until the credit is confirmed', async () => {
    const original = await GiveawayEntryTransaction.create(settledCharge({ idempotencyKey: 'charge-a' }));
    const reversals = await GiveawayEntryTransaction.reverse(original._id, {
      authorizedBy: new mongoose.Types.ObjectId(),
      reason: 'operator policy: winner not eligible',
    });

    expect(reversals.type).toBe('REVERSAL');
    expect(reversals.direction).toBe('CREDIT');
    expect(reversals.status).toBe('PENDING'); // no provider reference => not claimed as settled
    expect(reversals.sourceTxnId.toString()).toBe(original._id.toString());
    const stillSettled = await GiveawayEntryTransaction.findById(original._id);
    expect(stillSettled.status).toBe('SUCCESS'); // nothing was rewritten
    expect(await GiveawayEntryTransaction.countDocuments()).toBe(2);
  });

  it('settles both sides when the provider confirms the credit', async () => {
    const original = await GiveawayEntryTransaction.create(settledCharge({ idempotencyKey: 'charge-b' }));
    const reversal = await GiveawayEntryTransaction.reverse(original._id, {
      authorizedBy: new mongoose.Types.ObjectId(),
      reason: 'policy authorized refund',
      externalTransactionId: 'credit-1',
      balanceBefore: 450,
      balanceAfter: 500,
    });
    expect(reversal.status).toBe('SUCCESS');
    const after = await GiveawayEntryTransaction.findById(original._id);
    expect(after.status).toBe('REVERSED');
  });

  it('cannot reverse the same charge twice — the ledger says so, not the app', async () => {
    const original = await GiveawayEntryTransaction.create(settledCharge({ idempotencyKey: 'charge-c' }));
    const actor = new mongoose.Types.ObjectId();
    await GiveawayEntryTransaction.reverse(original._id, { authorizedBy: actor, reason: 'first refund' });
    const err = await GiveawayEntryTransaction
      .reverse(original._id, { authorizedBy: actor, reason: 'second refund' })
      .catch((e) => e);
    expect(err.code).toBe(11000); // unique (idempotencyKey) + partial unique (sourceTxnId)
    expect(await GiveawayEntryTransaction.countDocuments({ type: 'REVERSAL' })).toBe(1);
  });

  it('refuses a reversal without an authorizing actor and a reason', async () => {
    const original = await GiveawayEntryTransaction.create(settledCharge({ idempotencyKey: 'charge-d' }));
    await expect(
      GiveawayEntryTransaction.reverse(original._id, { reason: 'no actor' }),
    ).rejects.toThrow(/REVERSAL_UNAUTHORIZED/);
    await expect(
      GiveawayEntryTransaction.reverse(original._id, { authorizedBy: new mongoose.Types.ObjectId() }),
    ).rejects.toThrow(/REVERSAL_UNAUTHORIZED/);
  });

  it('a reversal of a not-yet-settled charge is refused', async () => {
    const pending = await GiveawayEntryTransaction.create(
      settledCharge({ status: 'PENDING', externalTransactionId: null, balanceBefore: null, balanceAfter: null, idempotencyKey: 'charge-e' }),
    );
    await expect(
      GiveawayEntryTransaction.reverse(pending._id, { authorizedBy: new mongoose.Types.ObjectId(), reason: 'too early' }),
    ).rejects.toThrow(/REVERSAL_STATE/);
  });
});

describe('winner counts and duplicate winners', () => {
  it('refuses more winners than the tier has slots', async () => {
    const { giveaway, prizes, people } = await makeScenario({ winnerCount: 2, users: 3 });
    for (const person of people) {
      await GiveawayParticipation.create(participationFor(person, giveaway));
    }
    await GiveawayWinner.create({ giveawayId: giveaway._id, prizeId: prizes[0]._id, userId: people[0]._id, rank: 1, selection: { method: 'RANDOM' } });
    await GiveawayWinner.create({ giveawayId: giveaway._id, prizeId: prizes[0]._id, userId: people[1]._id, rank: 2, selection: { method: 'RANDOM' } });

    const err = await GiveawayWinner
      .create({ giveawayId: giveaway._id, prizeId: prizes[0]._id, userId: people[2]._id, rank: 3, selection: { method: 'RANDOM' } })
      .catch((e) => e);
    expect(err.message).toMatch(/exceeds capacity/);
    expect(await GiveawayWinner.countDocuments()).toBe(2);
  });

  it('two winners cannot occupy the same slot of the same tier', async () => {
    const { giveaway, prizes, people } = await makeScenario({ winnerCount: 2, users: 2 });
    for (const person of people) await GiveawayParticipation.create(participationFor(person, giveaway));
    await GiveawayWinner.create({ giveawayId: giveaway._id, prizeId: prizes[0]._id, userId: people[0]._id, rank: 1, selection: { method: 'RANDOM' } });
    const err = await GiveawayWinner
      .create({ giveawayId: giveaway._id, prizeId: prizes[0]._id, userId: people[1]._id, rank: 1, selection: { method: 'RANDOM' } })
      .catch((e) => e);
    expect(err.code).toBe(11000);
  });

  it('blocks a duplicate winner for the same prize, and allows it when the draw says so', async () => {
    const { giveaway, prizes, people } = await makeScenario({ winnerCount: 3, users: 1 });
    await GiveawayParticipation.create(participationFor(people[0], giveaway));
    await GiveawayWinner.create({ giveawayId: giveaway._id, prizeId: prizes[0]._id, userId: people[0]._id, rank: 1, selection: { method: 'RANDOM' } });

    const blocked = await GiveawayWinner
      .create({ giveawayId: giveaway._id, prizeId: prizes[0]._id, userId: people[0]._id, rank: 2, selection: { method: 'RANDOM' } })
      .catch((e) => e);
    expect(blocked.code).toBe(11000);

    // The exception is configuration, mirrored onto the row at draw time.
    const allowed = await GiveawayWinner.create({
      giveawayId: giveaway._id, prizeId: prizes[0]._id, userId: people[0]._id, rank: 3,
      selection: { method: 'RANDOM' }, duplicateAllowed: true,
    });
    expect(allowed.rank).toBe(3);
    expect(await GiveawayWinner.countDocuments()).toBe(2);
  });

  it('requires the winner to have actually entered that giveaway', async () => {
    const { giveaway, prizes, people } = await makeScenario({ winnerCount: 1, users: 1 });
    const stranger = await User.create({ veloopId: 'never-entered' });
    const err = await GiveawayWinner
      .create({
        giveawayId: giveaway._id, prizeId: prizes[0]._id, userId: stranger._id, rank: 1,
        selection: { method: 'RANDOM' },
        participationId: (await GiveawayParticipation.create(participationFor(people[0], giveaway)))._id,
      })
      .catch((e) => e);
    expect(err.message).toMatch(/participation/);
  });

  it('will not announce a winner whose public identity is not masked', async () => {
    const { giveaway, prizes, people } = await makeScenario({ winnerCount: 1, users: 1 });
    await GiveawayParticipation.create(participationFor(people[0], giveaway));
    const winner = await GiveawayWinner.create({
      giveawayId: giveaway._id, prizeId: prizes[0]._id, userId: people[0]._id, rank: 1, selection: { method: 'RANDOM' },
    });
    winner.announcementStatus = 'ANNOUNCED';
    await expect(winner.save()).rejects.toThrow(/Masked display info is required/);

    winner.displayInfo = { maskedUserId: 'usr_0001', displayAlias: 'Member #0001' };
    await winner.save();
    const publicList = await GiveawayWinner.findPublic(giveaway._id);
    expect(publicList).toHaveLength(1);
    expect(publicList[0].userId).toBeUndefined(); // the projection, not the client, decides
    expect(publicList[0].displayInfo.displayAlias).toBe('Member #0001');

    // Publication is one-way.
    winner.announcementStatus = 'HOLD';
    await expect(winner.save()).rejects.toThrow(/cannot be reverted/);
  });
});

describe('prize claims: ownership, deadline and PII containment', () => {
  async function makeWinner(claimType = 'FORM', prizeType = 'PHYSICAL') {
    const { giveaway, prizes, people } = await makeScenario({ winnerCount: 1, users: 1 });
    const prize = prizes[0];
    if (claimType !== 'FORM') {
      prize.prizeType = prizeType;
      prize.claimType = claimType;
      await prize.save();
    }
    await GiveawayParticipation.create(participationFor(people[0], giveaway));
    const winner = await GiveawayWinner.create({
      giveawayId: giveaway._id, prizeId: prize._id, userId: people[0]._id, rank: 1, selection: { method: 'RANDOM' },
    });
    return { giveaway, prize, winner, person: people[0] };
  }

  it('allows a claim to sit unsubmitted, then enforces the claim-type fulfilment shape on submit', async () => {
    const { giveaway, prize, winner, person } = await makeWinner();
    const claim = await PrizeClaim.create({
      winnerId: winner._id, giveawayId: giveaway._id, userId: person._id, prizeId: prize._id,
      claimType: 'FORM', prizeType: 'PHYSICAL', deadlineAt: new Date(Date.now() + 86_400_000),
    });
    expect(claim.status).toBe('NOT_SUBMITTED');

    claim.status = 'SUBMITTED';
    await expect(claim.save()).rejects.toThrow(/requires/); // no address yet

    claim.fulfillment = {
      physical: { fullName: 'Asha (dev)', phone: '98765 43210', address: '1 Example Road', city: 'Pune', state: 'MH', country: 'IN', postalCode: '411001' },
    };
    await claim.save();
    expect(claim.submittedAt).toBeInstanceOf(Date);
    expect(claim.history.map((h) => h.to)).toEqual(['SUBMITTED']);
  });

  it('walks the documented status path and refuses an illegal jump', async () => {
    const { giveaway, prize, winner, person } = await makeWinner();
    const claim = await PrizeClaim.create({
      winnerId: winner._id, giveawayId: giveaway._id, userId: person._id, prizeId: prize._id,
      claimType: 'FORM', prizeType: 'PHYSICAL', deadlineAt: new Date(Date.now() + 86_400_000),
      fulfillment: { physical: { fullName: 'Asha (dev)', phone: '98765 43210', address: '1 Example Road', city: 'Pune', state: 'MH', country: 'IN', postalCode: '411001' } },
      status: 'SUBMITTED',
    });
    claim.status = 'COMPLETED'; // skipping PROCESSING
    await expect(claim.save()).rejects.toThrow(/Illegal claim transition SUBMITTED -> COMPLETED/);
    claim.status = 'PROCESSING';
    await claim.save();
    claim.status = 'COMPLETED';
    await claim.save();
    expect(claim.completedAt).toBeInstanceOf(Date);
    claim.status = 'SUBMITTED';
    await expect(claim.save()).rejects.toThrow(/COMPLETED -> SUBMITTED/);
  });

  it('only a submitted claim can be read with fulfilment data, and the finder scopes by user', async () => {
    const { giveaway, prize, winner, person } = await makeWinner();
    const other = await User.create({ veloopId: 'nosey-parker' });
    const claim = await PrizeClaim.create({
      winnerId: winner._id, giveawayId: giveaway._id, userId: person._id, prizeId: prize._id,
      claimType: 'FORM', prizeType: 'PHYSICAL', deadlineAt: new Date(Date.now() + 86_400_000),
    });

    expect(claim.canBeReadBy(person._id)).toBe(true);
    expect(claim.canBeReadBy(other._id)).toBe(false);
    expect(claim.canBeReadBy(other._id, true)).toBe(true);

    const asStranger = await PrizeClaim.findScoped({ _id: claim._id }, { asUserId: other._id }).lean();
    expect(asStranger).toHaveLength(0); // no leak, even if the controller forgot its filter
    const asOwner = await PrizeClaim.findScoped({ _id: claim._id }, { asUserId: person._id }).lean();
    expect(asOwner).toHaveLength(1);
    const asAdmin = await PrizeClaim.findScoped({ _id: claim._id }, { isAdmin: true }).lean();
    expect(asAdmin).toHaveLength(1);
  });

  it('persists the PII but never serves it through a default serialization', async () => {
    const { giveaway, prize, winner, person } = await makeWinner();
    const claim = await PrizeClaim.create({
      winnerId: winner._id, giveawayId: giveaway._id, userId: person._id, prizeId: prize._id,
      claimType: 'FORM', prizeType: 'PHYSICAL', deadlineAt: new Date(Date.now() + 86_400_000),
      status: 'SUBMITTED',
      fulfillment: { physical: { fullName: 'Asha (dev)', phone: '98765 43210', address: '1 Example Road', city: 'Pune', state: 'MH', country: 'IN', postalCode: '411001' } },
      internalNote: 'winner replied once',
    });
    const reloaded = await PrizeClaim.findById(claim._id);
    expect(JSON.stringify(reloaded.toJSON())).not.toMatch(/Example Road/);
    expect(JSON.stringify(reloaded.toJSON())).not.toMatch(/winner replied/);
    expect(reloaded.toJSON({ includePrivate: true }).fulfillment.physical.postalCode).toBe('411001');
    // The raw row really does hold the address, so fulfilment is possible at all.
    const raw = await PrizeClaim.collection.findOne({ _id: claim._id });
    expect(raw.fulfillment.physical.address).toBe('1 Example Road');
  });

  it('one claim per winner, and an expired claim cannot be submitted', async () => {
    const { giveaway, prize, winner, person } = await makeWinner();
    await PrizeClaim.create({
      winnerId: winner._id, giveawayId: giveaway._id, userId: person._id, prizeId: prize._id,
      claimType: 'FORM', prizeType: 'PHYSICAL', deadlineAt: new Date(Date.now() + 86_400_000),
    });
    const dup = await PrizeClaim.create({
      winnerId: winner._id, giveawayId: giveaway._id, userId: person._id, prizeId: prize._id,
      claimType: 'FORM', prizeType: 'PHYSICAL', deadlineAt: new Date(Date.now() + 86_400_000),
    }).catch((e) => e);
    expect(dup.code).toBe(11000);

    const late = await PrizeClaim.create({
      winnerId: new mongoose.Types.ObjectId(), giveawayId: giveaway._id, userId: person._id, prizeId: prize._id,
      claimType: 'FORM', prizeType: 'PHYSICAL', deadlineAt: new Date(Date.now() - 86_400_000),
    });
    expect(late.isExpired()).toBe(true);
    late.status = 'SUBMITTED';
    late.fulfillment = { physical: { fullName: 'Asha (dev)', phone: '98765 43210', address: '1 Example Road', city: 'Pune', state: 'MH', country: 'IN', postalCode: '411001' } };
    await expect(late.save()).rejects.toThrow(/after the deadline/);
  });

  it('a digital claim needs a delivery target instead of an address', async () => {
    const { giveaway, prize, winner, person } = await makeWinner('DIGITAL_DELIVERY', 'GIFT_CARD');
    const claim = await PrizeClaim.create({
      winnerId: winner._id, giveawayId: giveaway._id, userId: person._id, prizeId: prize._id,
      claimType: 'DIGITAL_DELIVERY', prizeType: 'GIFT_CARD', deadlineAt: new Date(Date.now() + 86_400_000),
    });
    claim.status = 'SUBMITTED';
    await expect(claim.save()).rejects.toThrow(/delivery target/);
    claim.fulfillment = { digital: { deliveryEmail: 'winner@example.com', deliveryTargetMasked: 'w***@example.com' } };
    await claim.save();
    expect(claim.status).toBe('SUBMITTED');
  });
});

describe('giveaway lifecycle and history protection', () => {
  it('walks UPCOMING -> ACTIVE -> ENDED -> ARCHIVED and refuses shortcuts', async () => {
    const now = new Date();
    const doc = await Giveaway.create({
      title: 'Lifecycle', slug: 'lifecycle-test', startAt: now, endAt: new Date(now.getTime() + 86_400_000), status: 'UPCOMING',
    });
    doc.status = 'ENDED'; // skipping ACTIVE
    await expect(doc.save()).rejects.toThrow(/Illegal lifecycle transition UPCOMING -> ENDED/);

    doc.status = 'ACTIVE';
    await doc.save();
    doc.status = 'UPCOMING';
    await expect(doc.save()).rejects.toThrow(/Illegal lifecycle transition ACTIVE -> UPCOMING/);

    doc.status = 'ENDED';
    await doc.save();
    doc.status = 'ARCHIVED';
    await doc.save();
    expect(doc.archivedAt).toBeInstanceOf(Date);
    expect(doc.statusHistory.map((h) => h.to)).toEqual(['ACTIVE', 'ENDED', 'ARCHIVED']);

    doc.status = 'ACTIVE';
    await expect(doc.save()).rejects.toThrow(/Illegal lifecycle transition ARCHIVED -> ACTIVE/);
  });

  it('protects a draw that has been published or collected participation', async () => {
    const { giveaway, people } = await makeScenario({ users: 1 });
    await GiveawayParticipation.create(participationFor(people[0], giveaway));
    await expect(giveaway.deleteOne()).rejects.toThrow(/HISTORY_PROTECTED/);

    // A never-published, never-entered draw is the documented removable case.
    const scratch = await Giveaway.create({
      title: 'Scratch', slug: 'scratch-only', startAt: new Date(), endAt: new Date(Date.now() + 1000), status: 'UPCOMING',
    });
    await scratch.deleteOne();
    expect(await Giveaway.countDocuments({ slug: 'scratch-only' })).toBe(0);
  });

  it('blocks bulk deletes until the caller names the escape hatch', async () => {
    await makeScenario({ users: 1 });
    await expect(Giveaway.deleteMany({})).rejects.toThrow(/HISTORY_PROTECTED/);
    await expect(Giveaway.findOneAndDelete({})).rejects.toThrow(/HISTORY_PROTECTED/);
    // This is exactly what npm run seed:reset does, and only for seed rows.
    const res = await Giveaway.deleteMany({}, OVER);
    expect(res.deletedCount).toBeGreaterThan(0);
  });

  it('retains the identity row that every other record references', async () => {
    const { giveaway, people } = await makeScenario({ users: 1 });
    await GiveawayParticipation.create(participationFor(people[0], giveaway));

    // Document delete and bulk query delete are both refused…
    await expect(people[0].deleteOne()).rejects.toThrow(/HISTORY_PROTECTED/);
    await expect(User.deleteMany({ _id: people[0]._id })).rejects.toThrow(/HISTORY_PROTECTED/);
    // …and only the documented dev/reset escape hatch reaches the row.
    await User.deleteMany({ _id: people[0]._id }, OVER);
    expect(await User.countDocuments()).toBe(0);
    expect(await GiveawayParticipation.countDocuments()).toBe(1); // the history stays
  });
});

describe('fraud events and audit log: minimal data, append-only', () => {
  it('stores only pseudonymous references and merges repeat signals', async () => {
    const { giveaway, people } = await makeScenario({ users: 1 });
    const device = hashReference('device-9');
    const first = await FraudEvent.recordOrMerge({
      type: 'DEVICE_VELOCITY', giveawayId: giveaway._id, userId: people[0]._id, deviceHash: device,
      severity: 'LOW', signal: { ruleKey: 'entries_per_device_per_hour', observed: 6, threshold: 5, windowSeconds: 3600 },
    });
    const second = await FraudEvent.recordOrMerge({
      type: 'DEVICE_VELOCITY', giveawayId: giveaway._id, userId: people[0]._id, deviceHash: device,
      severity: 'HIGH', signal: { ruleKey: 'entries_per_device_per_hour', observed: 9, threshold: 5, windowSeconds: 3600 },
    });

    expect(second._id.toString()).toBe(first._id.toString()); // merged, not duplicated
    expect(second.occurrenceCount).toBe(2);
    expect(second.severity).toBe('HIGH'); // escalates, never downgrades
    expect(await FraudEvent.countDocuments()).toBe(1);
    const raw = await FraudEvent.collection.findOne({ _id: first._id });
    expect(raw.deviceHash).toBe(device);
    expect(JSON.stringify(raw)).not.toMatch(/Mozilla|192\.168|@/i); // no raw identifiers present
  });

  it('a resolved fraud event keeps its decision', async () => {
    const event = await FraudEvent.create({ type: 'DUPLICATE_ATTEMPT', deviceHash: hashReference('d') });
    event.status = 'DISMISSED';
    await expect(event.save()).rejects.toThrow(/actor and a resolution timestamp/);
    event.resolvedBy = new mongoose.Types.ObjectId();
    event.resolvedAt = new Date();
    event.resolutionNote = 'single user on shared family device';
    await event.save();
    event.status = 'OPEN';
    await expect(event.save()).rejects.toThrow(/already DISMISSED/);
  });

  it('audit entries are append-only, both by document and by query', async () => {
    const entry = await AuditLog.record({
      actorId: 'system', action: 'giveaway.status.update', entityType: 'Giveaway', entityId: 'abc',
      before: { status: 'ACTIVE' }, after: { status: 'ENDED' },
    });
    entry.reason = 'corrected';
    await expect(entry.save()).rejects.toThrow(/AUDIT_APPEND_ONLY/);
    await expect(AuditLog.updateOne({ _id: entry._id }, { $set: { reason: 'rewritten' } })).rejects.toThrow(/AUDIT_APPEND_ONLY/);
    await expect(AuditLog.findOneAndUpdate({ _id: entry._id }, { $set: { reason: 'rewritten' } })).rejects.toThrow(/AUDIT_APPEND_ONLY/);
    await expect(AuditLog.deleteOne({ _id: entry._id })).rejects.toThrow(/HISTORY_PROTECTED/);
    await expect(entry.deleteOne()).rejects.toThrow(/HISTORY_PROTECTED/);
    expect(await AuditLog.countDocuments()).toBe(1);
  });

  it('refuses to store PII that a caller forwarded in a snapshot', async () => {
    await AuditLog.record({
      action: 'claim.submitted', entityType: 'PrizeClaim', entityId: 'claim-1',
      after: {
        status: 'SUBMITTED',
        fulfillment: { physical: { fullName: 'Asha', address: '1 Example Road', phone: '9876543210' } },
        user: { email: 'asha@example.com', password: 'hunter2', token: 'abc', deviceHash: hashReference('d') },
        prizeName: 'iPhone 15 Pro',
      },
    });
    const raw = await AuditLog.collection.findOne({ action: 'claim.submitted' });
    const json = JSON.stringify(raw);
    expect(json).not.toMatch(/Example Road/);
    expect(json).not.toMatch(/asha@example\.com/);
    expect(json).not.toMatch(/hunter2/);
    expect(json).not.toMatch(/9876543210/);
    expect(raw.after.status).toBe('SUBMITTED'); // safe fields survive
    expect(raw.after.prizeName).toBe('iPhone 15 Pro');
  });

  it('supports "history of this entity" through an index that really exists', async () => {
    for (const id of ['g1', 'g2']) {
      await AuditLog.record({ action: 'giveaway.updated', entityType: 'Giveaway', entityId: id });
    }
    const indexes = await AuditLog.collection.indexes();
    const historyIndex = indexes.find((i) => i.key.entityType === 1 && i.key.entityId === 1 && i.key.createdAt === -1);
    expect(historyIndex).toBeTruthy();
    const rows = await AuditLog.find({ entityType: 'Giveaway', entityId: 'g1' }).sort({ createdAt: -1 }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('giveaway.updated');
  });
});

describe('wallet reference cache (external system, never a second truth)', () => {
  it('keeps one snapshot per user and currency, and records its provenance', async () => {
    const user = await User.create({ veloopId: 'wallet-owner' });
    const snapshot = await WalletReference.recordSnapshot({
      userId: user._id, currency: 'VE', balance: 725, externalWalletId: 'vw-001', source: 'VELOOP_API',
    });
    expect(snapshot.balance).toBe(725);
    expect(snapshot.stale).toBe(false);
    expect(snapshot.isFresh(60)).toBe(true);

    await WalletReference.recordSnapshot({ userId: user._id, currency: 'VE', balance: 700, source: 'VELOOP_API' });
    expect(await WalletReference.countDocuments({ userId: user._id, currency: 'VE' })).toBe(1);

    const err = await WalletReference.create({ userId: user._id, currency: 'VE', source: 'MANUAL' }).catch((e) => e);
    expect(err.code).toBe(11000);
  });

  it('marks a snapshot stale after a provider failure without inventing a balance', async () => {
    const user = await User.create({ veloopId: 'stale-owner' });
    await WalletReference.recordSnapshot({ userId: user._id, currency: 'TOKEN', balance: 10, source: 'VELOOP_API' });
    await WalletReference.markStale(user._id, 'TOKEN', 'WALLET_UPSTREAM_TIMEOUT');
    const doc = await WalletReference.findOne({ userId: user._id, currency: 'TOKEN' });
    expect(doc.stale).toBe(true);
    expect(doc.lastErrorCode).toBe('WALLET_UPSTREAM_TIMEOUT');
    expect(doc.isFresh(3600)).toBe(false); // stale => must be re-read from the API
  });

  it('refuses a fixture balance in production, even against a real database', async () => {
    const user = await User.create({ veloopId: 'fixture-owner' });
    expect(() =>
      WalletReference.recordSnapshot({ userId: user._id, currency: 'VE', balance: 9999, source: 'SEED_FIXTURE' }, { isProduction: true }),
    ).toThrow(/WALLET_FIXTURE_IN_PRODUCTION/);
    expect(await WalletReference.countDocuments({ userId: user._id })).toBe(0);
  });
});

describe('versioned dev seed and documented reset', () => {
  it('seeds the fictional fixtures, then removes exactly those rows', async () => {
    const { seedDev } = require('../../scripts/seed/seed.dev.js');
    const { SEED_VERSION } = require('../../scripts/seed/fixtures.dev.js');

    // One NON-fixture row, to prove the reset cannot touch application data.
    const real = await Giveaway.create({
      title: 'Not Seeded', slug: 'not-seeded-draw', startAt: new Date(), endAt: new Date(Date.now() + 86_400_000),
    });

    const seeded = await seedDev({ log: () => {}, runMigrationFn: () => runMigration({ log: () => {} }) });
    await ensureConnected();
    expect(seeded.skipped).toBe(false);
    expect(seeded.counts.giveaways).toBeGreaterThan(0);
    expect(seeded.counts.participations).toBeGreaterThan(0);

    // Every seeded row is tagged, and every lifecycle state exists as real data.
    expect(await Giveaway.countDocuments({ seedBatch: SEED_VERSION })).toBe(seeded.counts.giveaways);
    expect(await Giveaway.distinct('status', { seedBatch: SEED_VERSION })).toEqual(
      expect.arrayContaining(['UPCOMING', 'ACTIVE', 'ENDED', 'ARCHIVED']),
    );
    expect(await Prize.distinct('prizeType', { seedBatch: SEED_VERSION })).toEqual(
      expect.arrayContaining(['PHYSICAL', 'GIFT_CARD', 'DIGITAL']),
    );
    expect(await GiveawayEntryTransaction.distinct('status', { seedBatch: SEED_VERSION })).toEqual(
      expect.arrayContaining(['PENDING', 'SUCCESS', 'FAILED', 'REVERSED']),
    );
    // The seed asserts the same invariants the app relies on.
    const pairs = await GiveawayParticipation.aggregate([
      { $group: { _id: { u: '$userId', g: '$giveawayId' }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ]);
    expect(pairs).toHaveLength(0);

    // Re-running without --force is a no-op, so a second deploy cannot duplicate data.
    await ensureConnected();
    const again = await seedDev({ log: () => {}, runMigrationFn: () => Promise.resolve() });
    expect(again.skipped).toBe(true);
    await ensureConnected();

    const { resetDev } = require('../../scripts/seed/reset.dev.js');
    const reset = await resetDev({ log: () => {} });

    // resetDev() disconnects cleanly by design (it is also a CLI entry point), so
    // the shared test connection is restored before asserting on the outcome.
    await ensureConnected();

    expect(reset.removed.Giveaway).toBe(seeded.counts.giveaways);
    expect(await Giveaway.countDocuments({ seedBatch: SEED_VERSION })).toBe(0);
    // Real records are unreachable by the reset: only seedBatch-tagged rows go.
    expect(await Giveaway.countDocuments({ seedBatch: null })).toBe(1);
    expect(await Giveaway.findById(real._id)).toBeTruthy(); // the non-fixture draw survived
  });

  it('a fixture that breaks a database rule is refused, not silently inserted', async () => {
    const { buildFixtures, stamp } = require('../../scripts/seed/fixtures.dev.js');
    const rows = stamp(buildFixtures(new Date()).participations);
    await GiveawayParticipation.create(rows[0]);
    // Replaying the same (userId, giveawayId) pair hits the unique index.
    await expect(
      GiveawayParticipation.create({ ...rows[0], _id: new mongoose.Types.ObjectId() }),
    ).rejects.toThrow(/E11000|duplicate key/i);
    expect(await GiveawayParticipation.countDocuments()).toBe(1);
  });
});
