/**
 * Model-layer unit tests — schema structure, enums, validation rules and index
 * DECLARATIONS, without a database.
 *
 * IMPORTANT: these tests call `await doc.validate()`, never `validateSync()`.
 * Mongoose's synchronous validation skips pre/post-validate middleware entirely,
 * and almost every domain rule in this model set lives in that middleware
 * (lifecycle checks, claim-type fulfilment, balance reconciliation). A rule that
 * only a real MongoDB can prove (index actually created, duplicate insert
 * actually rejected) is covered in tests/integration/models.indexes.test.js.
 */
const mongoose = require('mongoose');
const path = require('path');
const { execFileSync } = require('child_process');
const models = require('../../src/models/index.js');
const {
  CLAIM_STATUSES,
  GIVEAWAY_STATUSES,
  GIVEAWAY_STATUS_TRANSITIONS,
  PRIZE_TYPES,
  PRIZE_TYPE,
  CLAIM_TYPE,
  TRANSACTION_STATUS,
  TRANSACTION_TYPE,
  CURRENCIES,
} = require('../../src/config/constants.js');
const { hashReference } = require('../../src/utils/schema.js');

const oid = () => new mongoose.Types.ObjectId();

/**
 * Re-reads the FraudEvent schema in a FRESH process with the given boot-time env,
 * because `FRAUD_RETENTION_DAYS` is read when the model is first required — setting
 * it inside this test process would not recompile the schema. Returns the TTL index
 * declaration as an object, or null when the deployment does not ask for retention.
 */
function fraudTtlIndexWithEnv(value) {
  const env = { ...process.env };
  if (value === undefined) delete env.FRAUD_RETENTION_DAYS;
  else env.FRAUD_RETENTION_DAYS = String(value);
  const modelPath = path.resolve(__dirname, '../../src/models/fraudEvent.model.js');
  const script =
    `const M = require(${JSON.stringify(modelPath)});` +
    "const hit = M.schema.indexes().find(([, o]) => o && o.name === 'ttl_expiresAt');" +
    "process.stdout.write(hit ? JSON.stringify({ key: hit[0], ttl: hit[1].expireAfterSeconds }) : '');";
  const out = execFileSync(process.execPath, ['-e', script], {
    env,
    cwd: path.resolve(__dirname, '../..'),
    encoding: 'utf8',
  });
  return out ? JSON.parse(out) : null;
}

/** Runs the full validation chain and returns the error map ({} when valid). */
async function errorsOf(doc) {
  try {
    await doc.validate();
    return {};
  } catch (err) {
    if (!err || !err.errors) throw err;
    return err.errors;
  }
}

/** Fails with a readable list when a document was expected to be valid. */
async function expectValid(doc) {
  const errors = await errorsOf(doc);
  const keys = Object.keys(errors);
  if (keys.length) {
    throw new Error(
      `unexpected validation errors: ${keys.map((k) => `${k}: ${errors[k].message}`).join(' | ')}`,
    );
  }
}

/** Finds a declared index by its key shape, returning its options (or null). */
function declaredIndex(Model, key) {
  const want = Object.entries(key).map(([k, v]) => [k, Number(v)]);
  const hit = Model.schema.indexes().find(([fields]) => {
    const got = Object.entries(fields).map(([k, v]) => [k, Number(v)]);
    return JSON.stringify(got) === JSON.stringify(want);
  });
  return hit ? hit[1] || {} : null;
}

describe('model registry', () => {
  it('registers the specified models on the shared connection', () => {
    expect(Object.keys(models).sort()).toEqual(
      [
        'AuditLog',
        'DevWalletBalance',
        'FraudEvent',
        'Giveaway',
        'GiveawayEntryTransaction',
        'GiveawayParticipation',
        'GiveawayWinner',
        'IdempotencyKey',
        'Prize',
        'PrizeClaim',
        'User',
        'WalletReference',
      ].sort(),
    );
    for (const [name, model] of Object.entries(models)) {
      expect(model.modelName).toBe(name);
      expect(mongoose.models[name]).toBeDefined();
    }
  });

  it('every collection carries a seedBatch marker that is null unless seeded', () => {
    for (const Model of Object.values(models)) {
      expect(Model.schema.path('seedBatch')).toBeTruthy();
      expect(Model.schema.path('seedBatch').options.default).toBeNull();
    }
  });
});

describe('Giveaway', () => {
  const base = () => ({
    title: 'iPhone 15 Pro',
    slug: 'iphone-15-pro',
    startAt: new Date('2026-11-01T00:00:00Z'),
    endAt: new Date('2026-11-21T00:00:00Z'),
  });

  it('lifecycle enum is exactly the four specified states', async () => {
    expect(GIVEAWAY_STATUSES).toEqual(['UPCOMING', 'ACTIVE', 'ENDED', 'ARCHIVED']);
    const bad = new models.Giveaway({ ...base(), status: 'NOT_A_STATUS' });
    expect((await errorsOf(bad)).status).toBeDefined();
    await expectValid(new models.Giveaway({ ...base(), status: 'ACTIVE' }));
  });

  it('defaults to UPCOMING, unpublished, and carries the spec fields', async () => {
    const doc = new models.Giveaway({ ...base(), description: 'Fictional dev draw' });
    await expectValid(doc);
    expect(doc.status).toBe('UPCOMING');
    expect(doc.published).toBe(false);
    for (const path of ['title', 'slug', 'description', 'rules', 'eligibility', 'startAt', 'endAt', 'status', 'prizeConfig', 'participation']) {
      expect(doc.schema.paths[path] || doc[path] !== undefined).toBeTruthy();
    }
    // Fees/limits are configuration data, not controller branches.
    expect(doc.participation.entryCurrencies).toEqual(['VE']);
    expect(doc.participation.maxEntriesPerUser).toBe(1);
    expect(doc.prizeConfig.drawMethod).toBe('RANDOM');
  });

  it('requires a real time window and refuses endAt <= startAt', async () => {
    const missing = new models.Giveaway({ title: 'No window', slug: 'no-window' });
    const errors = await errorsOf(missing);
    expect(errors.startAt).toBeDefined();
    expect(errors.endAt).toBeDefined();

    const backwards = new models.Giveaway({ ...base(), endAt: base().startAt });
    expect((await errorsOf(backwards)).endAt.message).toMatch(/after startAt/);
  });

  it('slug is URL-safe and lowercase-normalized', async () => {
    const ugly = new models.Giveaway({ ...base(), slug: 'Not A Slug!' });
    expect((await errorsOf(ugly)).slug).toBeDefined();
    const cased = new models.Giveaway({ ...base(), slug: 'iPhone-15-Pro' });
    expect(cased.slug).toBe('iphone-15-pro');
    await expectValid(cased);
  });

  it('requires at least one configured entry currency', async () => {
    const doc = new models.Giveaway({ ...base(), participation: { entryCurrencies: [] } });
    expect((await errorsOf(doc))['participation.entryCurrencies']).toBeDefined();
  });

  it('exposes the entry-window decision the entry service will call', () => {
    const doc = new models.Giveaway({ ...base(), status: 'ACTIVE' });
    expect(doc.isOpenForEntries(new Date('2026-11-05T00:00:00Z'))).toBe(false); // not published yet
    doc.published = true;
    expect(doc.isOpenForEntries(new Date('2026-11-05T00:00:00Z'))).toBe(true);
    expect(doc.isOpenForEntries(new Date('2026-11-25T00:00:00Z'))).toBe(false); // window closed
    doc.status = 'ENDED';
    expect(doc.isOpenForEntries(new Date('2026-11-05T00:00:00Z'))).toBe(false);
  });

  it('declares a forward-only transition table with no way back from ARCHIVED', () => {
    expect(GIVEAWAY_STATUS_TRANSITIONS.UPCOMING).toEqual(['ACTIVE', 'ARCHIVED']);
    expect(GIVEAWAY_STATUS_TRANSITIONS.ARCHIVED).toEqual([]);
  });

  it('indexes the public read paths and keeps slug unique', () => {
    expect(declaredIndex(models.Giveaway, { slug: 1 }).unique).toBe(true);
    expect(declaredIndex(models.Giveaway, { status: 1, endAt: -1 })).toBeTruthy();
    expect(declaredIndex(models.Giveaway, { published: 1, status: 1, startAt: 1 })).toBeTruthy();
  });
});

describe('Prize', () => {
  const base = () => ({
    giveawayId: oid(),
    name: 'iPhone 15 Pro',
    position: 1,
    winnerCount: 2,
    prizeType: PRIZE_TYPES[0],
    entryCurrency: 'VE',
    entryAmount: 50,
  });

  it('prizeType enum is exactly PHYSICAL / GIFT_CARD / DIGITAL', async () => {
    expect(PRIZE_TYPES).toEqual(['PHYSICAL', 'GIFT_CARD', 'DIGITAL']);
    const doc = new models.Prize({ ...base(), prizeType: 'CASH' });
    expect((await errorsOf(doc)).prizeType).toBeDefined();
  });

  it('derives claimType from prizeType only when the operator left it unset', async () => {
    const physical = new models.Prize(base());
    await expectValid(physical);
    expect(physical.claimType).toBe(CLAIM_TYPE.FORM);

    const card = new models.Prize({ ...base(), prizeType: 'GIFT_CARD' });
    await expectValid(card);
    expect(card.claimType).toBe(CLAIM_TYPE.DIGITAL_DELIVERY);

    const explicit = new models.Prize({ ...base(), prizeType: 'DIGITAL', claimType: CLAIM_TYPE.AUTOMATIC });
    await expectValid(explicit);
    expect(explicit.claimType).toBe(CLAIM_TYPE.AUTOMATIC);
  });

  it('refuses a PHYSICAL prize that needs no winner action, and a redundant fee override', async () => {
    const auto = new models.Prize({ ...base(), claimType: CLAIM_TYPE.AUTOMATIC });
    expect((await errorsOf(auto)).claimType.message).toMatch(/fulfilment details/);

    const dup = new models.Prize({ ...base(), feeOverrides: [{ currency: 'VE', amount: 40 }] });
    expect((await errorsOf(dup)).feeOverrides).toBeDefined();
  });

  it('requires a positive fee in a supported currency', async () => {
    await expectValid(new models.Prize({ ...base(), entryAmount: 0 })); // free entry is legal
    expect((await errorsOf(new models.Prize({ ...base(), entryAmount: -5 }))).entryAmount).toBeDefined();
    expect((await errorsOf(new models.Prize({ ...base(), entryCurrency: 'DOGE' }))).entryCurrency).toBeDefined();
    expect((await errorsOf(new models.Prize({ ...base(), winnerCount: 0 }))).winnerCount).toBeDefined();
    expect((await errorsOf(new models.Prize({ ...base(), position: 0 }))).position).toBeDefined();
  });

  it('keeps the fee in configuration and rejects a currency the event does not enable', () => {
    expect(CURRENCIES).toEqual(['VE', 'SVE', 'TOKEN']);
    const giveaway = { participation: { entryCurrencies: ['VE'] } };
    expect(() => models.Prize.assertMatchesGiveaway(giveaway, { entryCurrency: 'SVE' })).toThrow(/PRIZE_FEE_POLICY/);
    expect(() =>
      models.Prize.assertMatchesGiveaway(giveaway, { entryCurrency: 'VE', feeOverrides: [{ currency: 'TOKEN' }] }),
    ).toThrow(/TOKEN/);
    expect(models.Prize.assertMatchesGiveaway(giveaway, { entryCurrency: 'VE' })).toBe(true);
    expect(models.Prize.sumWinnerCounts([{ winnerCount: 2 }, { winnerCount: 5 }])).toBe(7);
  });

  it('position is unique per giveaway (no two tiers in the same slot)', () => {
    expect(declaredIndex(models.Prize, { giveawayId: 1, position: 1 }).unique).toBe(true);
  });

  it('hides the code-pool reference from default serialization', async () => {
    const doc = new models.Prize({ ...base(), prizeType: 'DIGITAL', claimType: 'DIGITAL_DELIVERY' });
    await expectValid(doc);
    doc.claim.digital.codePoolId = 'pool-77';
    expect(doc.toJSON().claim.digital.codePoolId).toBeUndefined();
    expect(doc.toJSON({ includePrivate: true }).claim.digital.codePoolId).toBe('pool-77');
  });
});

describe('GiveawayParticipation', () => {
  const base = () => ({
    userId: oid(),
    giveawayId: oid(),
    entryCurrency: 'VE',
    entryAmount: 50,
  });

  it('declares THE database-level unique index on (userId, giveawayId)', () => {
    const opts = declaredIndex(models.GiveawayParticipation, { userId: 1, giveawayId: 1 });
    expect(opts).toBeTruthy();
    expect(opts.unique).toBe(true);
  });

  it('supports the spec fields and defaults to a PENDING row', async () => {
    const doc = new models.GiveawayParticipation({
      ...base(),
      prizeId: oid(),
      deviceRef: { deviceHash: hashReference('device-42'), country: 'IN', clientClass: 'desktop-chrome' },
      transactionId: oid(),
    });
    await expectValid(doc);
    expect(doc.status).toBe('PENDING');
    expect(doc.joinedAt).toBeInstanceOf(Date);
    expect(doc.transactionIds).toEqual([]);
  });

  it('requires the entry fee to be stated, and allows a free entry', async () => {
    const noFee = new models.GiveawayParticipation({ userId: oid(), giveawayId: oid() });
    const errors = await errorsOf(noFee);
    expect(errors.entryCurrency).toBeDefined();
    expect(errors.entryAmount).toBeDefined();
    await expectValid(new models.GiveawayParticipation({ ...base(), entryAmount: 0 }));
    expect((await errorsOf(new models.GiveawayParticipation({ ...base(), entryAmount: -1 }))).entryAmount).toBeDefined();
  });

  it('accepts a privacy-conscious device reference only — never a raw UA or IP', async () => {
    const raw = new models.GiveawayParticipation({
      ...base(),
      deviceRef: { deviceHash: 'Mozilla/5.0 (Windows)', ipHash: '192.168.1.10' },
    });
    const errors = await errorsOf(raw);
    expect(errors['deviceRef.deviceHash']).toBeDefined();
    expect(errors['deviceRef.ipHash']).toBeDefined();
    expect(hashReference('device-42')).toMatch(/^[a-f0-9]{32}$/);
    expect(hashReference('device-42')).not.toBe(hashReference('device-42', 'other-salt'));
  });

  it('rejects an unknown participation status', async () => {
    const doc = new models.GiveawayParticipation({ ...base(), status: 'MAYBE' });
    expect((await errorsOf(doc)).status).toBeDefined();
  });

  it('a prizeId must belong to the same giveaway (pure guard, no DB needed)', () => {
    const giveawayId = oid();
    expect(models.GiveawayParticipation.assertPrizeInGiveaway(giveawayId, null)).toBe(true);
    expect(models.GiveawayParticipation.assertPrizeInGiveaway(giveawayId, { giveawayId })).toBe(true);
    expect(() =>
      models.GiveawayParticipation.assertPrizeInGiveaway(giveawayId, { giveawayId: oid() }),
    ).toThrow(/PARTICIPATION_SCOPE/);
  });

  it('never serializes the device reference by default', () => {
    const doc = new models.GiveawayParticipation({ ...base(), deviceRef: { deviceHash: hashReference('d') } });
    expect(doc.toJSON().deviceRef).toBeUndefined();
    expect(doc.toJSON().id).toBeTruthy();
    expect(doc.toJSON({ includePrivate: true }).deviceRef.deviceHash).toBeTruthy();
  });

  it('refuses a hard delete of a charged row', async () => {
    const doc = new models.GiveawayParticipation({ ...base(), status: 'CONFIRMED', transactionId: oid() });
    expect(declaredIndex(models.GiveawayParticipation, { giveawayId: 1, status: 1 })).toBeTruthy();
    await expect(doc.deleteOne()).rejects.toThrow(/HISTORY_PROTECTED/);
  });
});

describe('GiveawayEntryTransaction', () => {
  const charge = () => ({
    userId: oid(),
    giveawayId: oid(),
    currency: 'VE',
    amount: 50,
    direction: 'DEBIT',
    type: TRANSACTION_TYPE.ENTRY_FEE,
    status: TRANSACTION_STATUS.SUCCESS,
    externalTransactionId: 'veloop-9001',
    balanceBefore: 500,
    balanceAfter: 450,
    idempotencyKey: 'entry:u1:g1',
    walletSource: 'VELOOP_API',
  });

  it('status enum is exactly PENDING / SUCCESS / FAILED / REVERSED with documented moves', async () => {
    expect(Object.keys(models.GiveawayEntryTransaction.STATUS_TRANSITIONS)).toEqual([
      'PENDING', 'SUCCESS', 'FAILED', 'REVERSED',
    ]);
    expect(models.GiveawayEntryTransaction.STATUS_TRANSITIONS.PENDING).toEqual(['SUCCESS', 'FAILED']);
    expect(models.GiveawayEntryTransaction.STATUS_TRANSITIONS.SUCCESS).toEqual(['REVERSED']);
    expect(models.GiveawayEntryTransaction.STATUS_TRANSITIONS.FAILED).toEqual([]);
    const doc = new models.GiveawayEntryTransaction({ ...charge(), status: 'SETTLED' });
    expect((await errorsOf(doc)).status).toBeDefined();
  });

  it('declares a unique idempotency index (no double charge) and one reversal per charge', () => {
    expect(declaredIndex(models.GiveawayEntryTransaction, { idempotencyKey: 1 }).unique).toBe(true);
    const provider = declaredIndex(models.GiveawayEntryTransaction, { externalTransactionId: 1 });
    expect(provider.unique).toBe(true);
    expect(provider.partialFilterExpression).toEqual({ externalTransactionId: { $type: 'string' } });
    const reversal = declaredIndex(models.GiveawayEntryTransaction, { sourceTxnId: 1 });
    expect(reversal.unique).toBe(true);
    expect(reversal.partialFilterExpression).toEqual({ type: TRANSACTION_TYPE.REVERSAL });
    expect(declaredIndex(models.GiveawayEntryTransaction, { status: 1, createdAt: 1 })).toBeTruthy();
  });

  it('requires a provider reference for a SUCCESS charge and an idempotency key always', async () => {
    const noProvider = charge();
    delete noProvider.externalTransactionId;
    expect((await errorsOf(new models.GiveawayEntryTransaction(noProvider))).externalTransactionId).toBeDefined();

    const noKey = charge();
    delete noKey.idempotencyKey;
    expect((await errorsOf(new models.GiveawayEntryTransaction(noKey))).idempotencyKey).toBeDefined();

    // A MANUAL snapshot may legitimately be settled without a provider reference.
    await expectValid(new models.GiveawayEntryTransaction({ ...noProvider, walletSource: 'MANUAL' }));
  });

  it('balances must reconcile: before -/+ amount = after', async () => {
    const bad = new models.GiveawayEntryTransaction({ ...charge(), balanceAfter: 400 });
    expect((await errorsOf(bad)).balanceAfter.message).toMatch(/does not reconcile/);
    await expectValid(new models.GiveawayEntryTransaction(charge()));
    const credit = new models.GiveawayEntryTransaction({
      ...charge(), direction: 'CREDIT', type: TRANSACTION_TYPE.ADJUSTMENT, sourceTxnId: oid(),
      balanceBefore: 450, balanceAfter: 500, idempotencyKey: 'adj:1',
    });
    await expectValid(credit);
  });

  it('an ENTRY_FEE is a DEBIT and a REVERSAL must reference the original as a CREDIT', async () => {
    const creditFee = new models.GiveawayEntryTransaction({ ...charge(), direction: 'CREDIT' });
    expect((await errorsOf(creditFee)).direction).toBeDefined();

    const orphan = new models.GiveawayEntryTransaction({
      ...charge(), type: TRANSACTION_TYPE.REVERSAL, direction: 'CREDIT', balanceBefore: 450, balanceAfter: 500,
    });
    expect((await errorsOf(orphan)).sourceTxnId).toBeDefined();

    const debitRefund = new models.GiveawayEntryTransaction({
      ...charge(), type: TRANSACTION_TYPE.REFUND, sourceTxnId: oid(), idempotencyKey: 'refund:1',
    });
    expect((await errorsOf(debitRefund)).direction).toBeDefined();
  });

  it('a PENDING row may be born without settlement data, and gets its own transactionId', async () => {
    const doc = new models.GiveawayEntryTransaction({
      ...charge(), status: 'PENDING', externalTransactionId: null, balanceBefore: null, balanceAfter: null,
    });
    await expectValid(doc);
    expect(doc.transactionId).toMatch(/^txn_/);
    expect(doc.completedAt).toBeNull();
  });

  it('refuses to delete a settled charge — history is preserved', async () => {
    const doc = new models.GiveawayEntryTransaction(charge());
    await expect(doc.deleteOne()).rejects.toThrow(/HISTORY_PROTECTED/);
  });

  it('reversalKeyFor is deterministic, so a refund can never be issued twice', () => {
    const id = oid();
    expect(models.GiveawayEntryTransaction.reversalKeyFor(id)).toBe(`reversal:${String(id)}`);
  });

  it('reverse() refuses to act without an authorizing actor and reason', async () => {
    // Policy first, database second: an unauthorized refund never reaches Mongo.
    await expect(models.GiveawayEntryTransaction.reverse(oid(), {})).rejects.toThrow(/REVERSAL_UNAUTHORIZED/);
    await expect(
      models.GiveawayEntryTransaction.reverse(oid(), { authorizedBy: oid() }),
    ).rejects.toThrow(/REVERSAL_UNAUTHORIZED/);
  });
});

describe('GiveawayWinner', () => {
  const base = () => ({
    giveawayId: oid(),
    prizeId: oid(),
    userId: oid(),
    rank: 1,
    selection: { method: 'RANDOM', snapshotHash: hashReference('snapshot-1'), candidateCount: 120 },
  });

  it('requires the spec references plus selection metadata and a 1-based rank', async () => {
    await expectValid(new models.GiveawayWinner(base()));
    const doc = new models.GiveawayWinner({ ...base(), rank: 0 });
    expect((await errorsOf(doc)).rank).toBeDefined();
    const weird = new models.GiveawayWinner({ ...base(), selection: { method: 'GUT_FEEL' } });
    expect((await errorsOf(weird))['selection.method']).toBeDefined();
    const none = new models.GiveawayWinner({ giveawayId: oid(), prizeId: oid(), rank: 1 });
    const errors = await errorsOf(none);
    expect(errors.userId).toBeDefined();
  });

  it('defaults to a held, unverified winner row', async () => {
    const doc = new models.GiveawayWinner(base());
    await expectValid(doc);
    expect(doc.announcementStatus).toBe('HOLD');
    expect(doc.verificationStatus).toBe('PENDING');
    expect(doc.duplicateAllowed).toBe(false);
  });

  it('slot capacity is indexed (rank unique per prize) and duplicates are blocked per prize', () => {
    expect(declaredIndex(models.GiveawayWinner, { prizeId: 1, rank: 1 }).unique).toBe(true);
    const dup = declaredIndex(models.GiveawayWinner, { prizeId: 1, userId: 1 });
    expect(dup.unique).toBe(true);
    // "unless explicitly allowed": the equality partial filter is what makes the
    // config-driven exception possible (MongoDB rejects $ne here).
    expect(dup.partialFilterExpression).toEqual({ duplicateAllowed: false });
    expect(declaredIndex(models.GiveawayWinner, { giveawayId: 1, announcementStatus: 1, rank: 1 })).toBeTruthy();
  });

  it('cannot be announced without masked public display info', async () => {
    const doc = new models.GiveawayWinner({ ...base(), announcementStatus: 'ANNOUNCED' });
    expect((await errorsOf(doc)).displayInfo).toBeDefined();
    doc.displayInfo = { maskedUserId: 'usr_0001', displayAlias: 'Member #0001' };
    await expectValid(doc);
    expect(doc.announcedAt).toBeNull(); // stamped on save, not on validate
  });

  it('refuses an unmasked email or phone in the public display block', async () => {
    const doc = new models.GiveawayWinner({
      ...base(),
      announcementStatus: 'ANNOUNCED',
      displayInfo: { maskedUserId: 'asha.developer@example.com' },
    });
    expect((await errorsOf(doc)).displayInfo.message).toMatch(/masked/);
    const phone = new models.GiveawayWinner({
      ...base(), announcementStatus: 'ANNOUNCED', displayInfo: { displayAlias: '+91 98765 43210' },
    });
    expect((await errorsOf(phone)).displayInfo).toBeDefined();
  });

  it('a winner row cannot be hard-deleted once drawn', async () => {
    const doc = new models.GiveawayWinner(base());
    await expect(doc.deleteOne()).rejects.toThrow(/HISTORY_PROTECTED/);
  });
});

describe('PrizeClaim', () => {
  const base = () => ({
    winnerId: oid(),
    giveawayId: oid(),
    userId: oid(),
    prizeId: oid(),
    claimType: CLAIM_TYPE.FORM,
    prizeType: PRIZE_TYPE.PHYSICAL,
    deadlineAt: new Date('2026-12-05T00:00:00Z'),
  });
  const address = () => ({
    fullName: 'Asha (dev)',
    phone: '98765 43210',
    address: '1 Example Road',
    city: 'Pune',
    state: 'MH',
    country: 'IN',
    postalCode: '411001',
  });

  it('uses the documented claim statuses and defaults to NOT_SUBMITTED', async () => {
    const doc = new models.PrizeClaim(base());
    await expectValid(doc);
    expect(doc.status).toBe('NOT_SUBMITTED');
    expect(CLAIM_STATUSES).toEqual(['NOT_SUBMITTED', 'SUBMITTED', 'PROCESSING', 'COMPLETED', 'EXPIRED']);
    expect((await errorsOf(new models.PrizeClaim({ ...base(), status: 'SHIPPED' }))).status).toBeDefined();
  });

  it('an untouched claim may exist with no details, but a SUBMITTED FORM claim needs an address', async () => {
    const empty = new models.PrizeClaim({ ...base(), status: 'SUBMITTED' });
    expect((await errorsOf(empty))['fulfillment.physical'].message).toMatch(/fullName/);
    const filled = new models.PrizeClaim({ ...base(), status: 'SUBMITTED', fulfillment: { physical: address() } });
    await expectValid(filled);
  });

  it('a DIGITAL_DELIVERY claim needs a delivery target, an AUTOMATIC claim accepts none', async () => {
    const digital = new models.PrizeClaim({
      ...base(), claimType: CLAIM_TYPE.DIGITAL_DELIVERY, prizeType: PRIZE_TYPE.GIFT_CARD, status: 'SUBMITTED',
    });
    expect((await errorsOf(digital))['fulfillment.digital.deliveryEmail']).toBeDefined();
    const withTarget = new models.PrizeClaim({
      ...base(), claimType: CLAIM_TYPE.DIGITAL_DELIVERY, prizeType: PRIZE_TYPE.GIFT_CARD, status: 'SUBMITTED',
      fulfillment: { digital: { deliveryEmail: 'winner@example.com', deliveryTargetMasked: 'w***@example.com' } },
    });
    await expectValid(withTarget);

    const auto = new models.PrizeClaim({ ...base(), claimType: CLAIM_TYPE.AUTOMATIC, fulfillment: { physical: { fullName: 'Nope' } } });
    expect((await errorsOf(auto)).fulfillment).toBeDefined();
  });

  it('a late submission is refused until an admin extends the deadline', async () => {
    const late = new models.PrizeClaim({
      ...base(), status: 'SUBMITTED', submittedAt: new Date('2026-12-06T00:00:00Z'), fulfillment: { physical: address() },
    });
    expect((await errorsOf(late)).submittedAt).toBeDefined();
    const extended = new models.PrizeClaim({ ...late.toObject({ includePrivate: true }), deadlineAt: new Date('2026-12-20T00:00:00Z') });
    await expectValid(extended);
  });

  it('never leaks fulfilment PII, operator notes or history by default', async () => {
    const doc = new models.PrizeClaim({
      ...base(), status: 'SUBMITTED', fulfillment: { physical: address() }, internalNote: 'called winner',
    });
    await expectValid(doc);
    const publicJson = doc.toJSON();
    expect(publicJson.fulfillment).toBeUndefined();
    expect(publicJson.internalNote).toBeUndefined();
    expect(publicJson.history).toBeUndefined();
    expect(JSON.stringify(publicJson)).not.toMatch(/Asha/);
    expect(doc.toJSON({ includePrivate: true }).fulfillment.physical.fullName).toBe('Asha (dev)');
  });

  it('access is restricted to the authorized winner or an admin — in the model', () => {
    const owner = oid();
    const doc = new models.PrizeClaim({ ...base(), userId: owner });
    expect(doc.canBeReadBy(owner)).toBe(true);
    expect(doc.canBeReadBy(oid())).toBe(false);
    expect(doc.canBeReadBy(null)).toBe(false);
    expect(doc.canBeReadBy(oid(), true)).toBe(true);
    // Scope is applied by the finder, so a forgotten filter cannot leak addresses.
    expect(models.PrizeClaim.findScoped({ status: 'SUBMITTED' }, { asUserId: owner }).getFilter())
      .toMatchObject({ status: 'SUBMITTED', userId: owner });
    expect(models.PrizeClaim.findScoped({ status: 'SUBMITTED' }, { isAdmin: true }).getFilter())
      .toEqual({ status: 'SUBMITTED' });
  });

  it('toPublicJSON is expiry-aware and carries no identity at all', () => {
    const doc = new models.PrizeClaim({ ...base(), deadlineAt: new Date('2020-01-01T00:00:00Z') });
    const out = doc.toPublicJSON(new Date('2026-01-01T00:00:00Z'));
    expect(out.status).toBe('EXPIRED');
    expect(out.canSubmit).toBe(false);
    expect(out.userId).toBeUndefined();
    expect(out.fulfillment).toBeUndefined();
  });

  it('claim transitions are declared and terminal states are closed', () => {
    expect(models.PrizeClaim.STATUS_TRANSITIONS.NOT_SUBMITTED).toEqual(['SUBMITTED', 'EXPIRED']);
    expect(models.PrizeClaim.STATUS_TRANSITIONS.SUBMITTED).toContain('PROCESSING');
    expect(models.PrizeClaim.STATUS_TRANSITIONS.COMPLETED).toEqual([]);
    expect(models.PrizeClaim.STATUS_TRANSITIONS.EXPIRED).toEqual([]);
    expect(models.PrizeClaim.REQUIRED_PHYSICAL_FIELDS).toContain('postalCode');
  });

  it('is undeletable once the winner has submitted, and internal use keeps the id', async () => {
    const doc = new models.PrizeClaim({ ...base(), status: 'SUBMITTED', submittedAt: new Date('2026-12-01T00:00:00Z'), fulfillment: { physical: address() } });
    await expect(doc.deleteOne()).rejects.toThrow(/HISTORY_PROTECTED/);
    const internal = doc.toObject();
    expect(internal._id).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(internal.fulfillment).toBeUndefined();
  });
});

describe('FraudEvent', () => {
  it('records type/severity/status/references and only pseudonymous correlation data', async () => {
    const doc = new models.FraudEvent({
      type: 'DEVICE_VELOCITY',
      severity: 'HIGH',
      status: 'OPEN',
      giveawayId: oid(),
      userId: oid(),
      deviceHash: hashReference('device-1'),
      signal: { ruleKey: 'entries_per_device_per_hour', metric: 'entries', observed: 9, threshold: 5, windowSeconds: 3600 },
    });
    await expectValid(doc);
    expect(doc.occurrenceCount).toBe(1);
    expect(doc.firstSeenAt).toBeInstanceOf(Date);
    expect(doc.lastSeenAt).toBeInstanceOf(Date);
    expect((await errorsOf(new models.FraudEvent({ type: 'VIBE_CHECK' }))).type).toBeDefined();
    expect((await errorsOf(new models.FraudEvent({ type: 'BOT_PATTERN', severity: 'EXTREME' }))).severity).toBeDefined();
  });

  it('refuses raw identifiers: hashes must be digests, not emails/IPs/UAs', async () => {
    const doc = new models.FraudEvent({ type: 'IP_VELOCITY', ipHash: '203.0.113.9', deviceHash: 'asha@example.com' });
    const errors = await errorsOf(doc);
    expect(errors.ipHash).toBeDefined();
    expect(errors.deviceHash).toBeDefined();
  });

  it('a terminal decision needs an actor and a timestamp', async () => {
    const doc = new models.FraudEvent({ type: 'MANUAL_REVIEW', status: 'CONFIRMED' });
    expect((await errorsOf(doc)).status).toBeDefined();
    const resolved = new models.FraudEvent({
      type: 'MANUAL_REVIEW',
      status: 'CONFIRMED',
      resolvedBy: oid(),
      resolvedAt: new Date(),
      resolutionNote: 'rule fired: duplicate device cluster',
    });
    await expectValid(resolved);
  });

  it('evidence cannot be deleted by application code (TTL is the only lifecycle)', async () => {
    const doc = new models.FraudEvent({ type: 'BOT_PATTERN' });
    await expect(doc.deleteOne()).rejects.toThrow(/HISTORY_PROTECTED/);
    expect(declaredIndex(models.FraudEvent, { status: 1, severity: -1, lastSeenAt: -1 })).toBeTruthy();
    expect(declaredIndex(models.FraudEvent, { deviceHash: 1, createdAt: -1 })).toBeTruthy();
  });

  it('merge lookups are indexed but deliberately not unique', () => {
    const merge = declaredIndex(models.FraudEvent, { type: 1, deviceHash: 1, userId: 1, giveawayId: 1, status: 1 });
    expect(merge).toBeTruthy();
    expect(merge.unique).toBeUndefined();
  });

  it('retention is a policy and needs a positive whole number of days', async () => {
    await expect(models.FraudEvent.applyRetention(0)).rejects.toThrow(/positive integer/);
    await expect(models.FraudEvent.applyRetention('thirty')).rejects.toThrow(/positive integer/);
  });

  it('declares the TTL index only when the deployment configures retention', () => {
    // Off by default: an undeclared index would be dropped by syncIndexes() and
    // reported as drift by `npm run db:migrate:check`.
    expect(fraudTtlIndexWithEnv(undefined)).toBeNull();
    expect(fraudTtlIndexWithEnv('0')).toBeNull();
    expect(fraudTtlIndexWithEnv('not-a-number')).toBeNull();
    expect(models.FraudEvent.RETENTION_DAYS).toBe(0); // this test runs without it

    const on = fraudTtlIndexWithEnv('30');
    expect(on).toEqual({ key: { expiresAt: 1 }, ttl: 0 });
  });
});

describe('AuditLog', () => {
  it('scrubs credential and PII keys wherever they appear, keeping the safe fields', () => {
    const scrub = models.AuditLog.scrub;
    const out = scrub({
      status: 'ACTIVE',
      entryAmount: 50,
      password: 'hunter2',
      user: { email: 'asha@example.com', kyc: { docNumber: 'AB123' }, displayName: 'Asha' },
      fulfillment: { physical: { phone: '98765 43210' } },
      deviceRef: { deviceHash: hashReference('d') },
    });
    expect(out.status).toBe('ACTIVE');
    expect(out.entryAmount).toBe(50);
    expect(out.user.displayName).toBe('Asha');
    expect(out.password).toBe('[REDACTED]');
    expect(out.user.email).toBe('[REDACTED]');
    expect(out.user.kyc).toBe('[REDACTED]');
    expect(out.fulfillment).toBe('[REDACTED]'); // the whole PII branch collapses
    expect(out.deviceRef.deviceHash).toBe('[REDACTED]');
  });

  it('does not over-redact ordinary domain words', () => {
    const out = models.AuditLog.scrub({ prizeType: 'PHYSICAL', winnerCount: 2, claimDeadlineDays: 7, pinned: false });
    expect(out).toEqual({ prizeType: 'PHYSICAL', winnerCount: 2, claimDeadlineDays: 7, pinned: false });
  });

  it('bounds depth, key count and string length so the trail cannot bloat', () => {
    const long = models.AuditLog.scrub({ note: 'x'.repeat(900) });
    expect(long.note.length).toBeLessThanOrEqual(506);
    expect(long.note.endsWith('…')).toBe(true);
    const deep = models.AuditLog.scrub({ a: { b: { c: { d: { e: 'nowhere' } } } } });
    // Past MAX_DEPTH the branch collapses to a marker instead of the raw payload.
    expect(deep).toEqual({ a: { b: { c: { d: '[TRUNCATED]' } } } });
    const many = models.AuditLog.scrub(Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`k${i}`, i])));
    expect(Object.keys(many).length).toBeLessThanOrEqual(40);
  });

  it('requires action, entityType and entityId', () => {
    expect(() => models.AuditLog.record({ action: 'giveaway.publish' })).toThrow(/AUDIT_INCOMPLETE/);
    expect(() => models.AuditLog.record({})).toThrow(/AUDIT_INCOMPLETE/);
  });

  it('is append-only: no updatedAt is ever written', () => {
    expect(models.AuditLog.schema.path('updatedAt')).toBeUndefined();
    expect(models.AuditLog.schema.options.timestamps.updatedAt).toBe(false);
    expect(declaredIndex(models.AuditLog, { entityType: 1, entityId: 1, createdAt: -1 })).toBeTruthy();
  });
});

describe('WalletReference (external VELOOP wallet seam)', () => {
  it('is one row per user+currency and records where the number came from', () => {
    expect(declaredIndex(models.WalletReference, { userId: 1, currency: 1 }).unique).toBe(true);
    const doc = new models.WalletReference({ userId: oid(), currency: 'VE', balance: 500, source: 'MANUAL', observedAt: new Date() });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.isFresh(120, new Date(Date.now() + 60_000))).toBe(true);
    expect(doc.isFresh(10, new Date(Date.now() + 60_000))).toBe(false);
    doc.stale = true;
    expect(doc.isFresh(3600)).toBe(false);
  });

  it('never accepts a fixture snapshot as authoritative in production', () => {
    expect(() =>
      models.WalletReference.recordSnapshot({ userId: oid(), currency: 'VE', balance: 1, source: 'SEED_FIXTURE' }, { isProduction: true }),
    ).toThrow(/WALLET_FIXTURE_IN_PRODUCTION/);
  });

  it('has no balance without an observation, so nothing is invented', () => {
    const doc = new models.WalletReference({ userId: oid(), currency: 'VE' });
    expect(doc.balance).toBeNull();
    expect(doc.observedAt).toBeNull();
    expect(doc.isFresh(60)).toBe(false);
  });

  it('rejects an unknown currency and a missing user', async () => {
    expect((await errorsOf(new models.WalletReference({ currency: 'BITS' }))).userId).toBeDefined();
    expect((await errorsOf(new models.WalletReference({ userId: oid(), currency: 'BITS' }))).currency).toBeDefined();
  });
});

describe('User', () => {
  it('keeps email and KYC out of every default serialization', () => {
    const doc = new models.User({ veloopId: 'dev-1', email: 'Asha@Example.com', displayName: 'Asha (dev)', publicAlias: 'Member #0001' });
    expect(doc.email).toBe('asha@example.com'); // normalized on write
    expect(doc.toJSON().email).toBeUndefined();
    expect(doc.toJSON().kyc).toBeUndefined();
    expect(doc.toJSON().id).toBeTruthy();
    expect(doc.toJSON({ includePrivate: true }).email).toBe('asha@example.com');
    expect(doc.isAdmin()).toBe(false);
    doc.roles = ['admin'];
    expect(doc.isAdmin()).toBe(true);
  });

  it('requires the external identity and rejects an unknown role or status', async () => {
    expect((await errorsOf(new models.User({ email: 'x@example.com' }))).veloopId).toBeDefined();
    const roles = await errorsOf(new models.User({ veloopId: 'dev-2', roles: ['superuser'] }));
    expect(Object.keys(roles).some((k) => k.startsWith('roles'))).toBe(true);
    expect((await errorsOf(new models.User({ veloopId: 'dev-3', status: 'ZOMBIE' }))).status).toBeDefined();
    await expectValid(new models.User({ veloopId: 'dev-4' }));
  });
});
