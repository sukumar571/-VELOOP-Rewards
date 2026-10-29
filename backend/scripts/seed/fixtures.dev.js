/**
 * ============================================================================
 * FICTIONAL DEVELOPMENT FIXTURES — version: dev-fixture-v2
 * ============================================================================
 * NOTHING in this file is real data. Every identity uses an @example.com (or
 * @example.test) address per RFC 2606/6761, every name is fictional, every
 * amount is invented, and every wallet snapshot is tagged SEED_FIXTURE so it can
 * never be mistaken for a balance read from the VELOOP provider.
 *
 * The fixtures deliberately cover the full spec surface so the model layer can be
 * exercised end to end:
 *   - all four giveaway lifecycle states (UPCOMING, ACTIVE, ENDED, ARCHIVED)
 *   - all three prize types (PHYSICAL, GIFT_CARD, DIGITAL) with fees in config
 *   - one participation per user per event (the unique index is exercised)
 *   - PENDING / SUCCESS / FAILED ledger rows plus one compensating REVERSAL pair
 *   - winners within slot capacity, and claims in several claim statuses
 *   - fraud events holding salted hashes only, and a couple of audit entries
 *
 * `seedBatch` is stamped on every document, which is what makes the documented
 * reset (`npm run seed:reset`) delete exactly these rows and nothing else.
 * ========================================================================= */
const { SEED_MARKER } = require('../../src/config/constants.js');

/** Single source of truth for the batch tag: constants.SEED_MARKER.value. */
const SEED_VERSION = SEED_MARKER.value;

/** 24-hex ObjectId built from a per-collection prefix so IDs stay stable. */
function oid(prefix, n) {
  return (String(prefix) + '0'.repeat(20)).slice(0, 20) + String(n).padStart(4, '0');
}

const P = {
  user: 'a',
  giveaway: 'b',
  prize: 'c',
  participation: 'd',
  txn: 'e',
  winner: 'f',
  claim: '1a',
  fraud: '2b',
};

const DAY = 86_400_000;

/**
 * Builds the whole fixture set relative to `now`, so countdowns and claim
 * deadlines always look sensible regardless of when the seed runs.
 */
function buildFixtures(now = new Date()) {
  const at = (offsetDays) => new Date(now.getTime() + offsetDays * DAY);

  const users = [
    { _id: oid(P.user, 1), veloopId: 'dev-veloop-0001', email: 'asha.developer@example.com', displayName: 'Asha (dev)', publicAlias: 'Member #0001', roles: ['user'], status: 'ACTIVE' },
    { _id: oid(P.user, 2), veloopId: 'dev-veloop-0002', email: 'ravi.tester@example.com', displayName: 'Ravi (dev)', publicAlias: 'Member #0002', roles: ['user'], status: 'ACTIVE' },
    { _id: oid(P.user, 3), veloopId: 'dev-veloop-0003', email: 'meera.qa@example.com', displayName: 'Meera (dev)', publicAlias: 'Member #0003', roles: ['user'], status: 'ACTIVE' },
    { _id: oid(P.user, 4), veloopId: 'dev-veloop-0004', email: 'blocker@example.com', displayName: 'Blocked (dev)', roles: ['user'], status: 'BLOCKED' },
    { _id: oid(P.user, 9), veloopId: 'dev-veloop-0009', email: 'ops.lead@example.com', displayName: 'Ops Lead (dev)', roles: ['user', 'admin'], status: 'ACTIVE' },
  ];

  const giveaways = [
    {
      _id: oid(P.giveaway, 1),
      title: 'iPhone 15 Pro Launch Giveaway',
      slug: 'dev-iphone-15-pro',
      tagline: 'Fictional flagship draw',
      description: 'FICTIONAL dev fixture. No real device, no real prize.',
      status: 'ACTIVE',
      published: true,
      publishedAt: at(-3),
      startAt: at(-2),
      endAt: at(5),
      featured: true,
      rules: { summary: 'One participation per account. Draw after entries close.', version: 'v1' },
      eligibility: { countries: ['IN'], minKycLevel: 'BASIC' },
      participation: { entryCurrencies: ['VE', 'SVE'], freeEntryCount: 1, maxEntriesPerUser: 5 },
      prizeConfig: { drawMethod: 'WEIGHTED_BY_ENTRIES', claimWindowDays: 7 },
    },
    {
      _id: oid(P.giveaway, 2),
      title: 'Swiggy Gold Voucher (Upcoming)',
      slug: 'dev-swiggy-gold-upcoming',
      status: 'UPCOMING',
      published: true,
      publishedAt: at(-1),
      startAt: at(2),
      endAt: at(9),
      rules: { summary: 'Starts later. FICTIONAL.', version: 'v1' },
      participation: { entryCurrencies: ['TOKEN'], freeEntryCount: 0, maxEntriesPerUser: 3 },
      prizeConfig: { drawMethod: 'RANDOM', claimWindowDays: 5 },
    },
    {
      _id: oid(P.giveaway, 3),
      title: 'PS5 Console Draw (Ended)',
      slug: 'dev-ps5-ended',
      status: 'ENDED',
      published: true,
      publishedAt: at(-30),
      startAt: at(-28),
      endAt: at(-7),
      rules: { summary: 'Closed; winner announced. FICTIONAL.', version: 'v2' },
      participation: { entryCurrencies: ['VE'], freeEntryCount: 1, maxEntriesPerUser: 10 },
      prizeConfig: { drawMethod: 'RANDOM', claimWindowDays: 14 },
    },
    {
      _id: oid(P.giveaway, 4),
      title: 'Old Headphones Draw (Archived)',
      slug: 'dev-headphones-archived',
      status: 'ARCHIVED',
      published: true,
      publishedAt: at(-120),
      startAt: at(-118),
      endAt: at(-100),
      archivedAt: at(-90),
      rules: { summary: 'Historical record, retained. FICTIONAL.', version: 'v1' },
      participation: { entryCurrencies: ['VE'], freeEntryCount: 0, maxEntriesPerUser: 2 },
      prizeConfig: { drawMethod: 'RANDOM' },
    },
    {
      _id: oid(P.giveaway, 5),
      title: 'Unpublished Draft (admins only)',
      slug: 'dev-unpublished-draft',
      status: 'UPCOMING',
      published: false,
      startAt: at(10),
      endAt: at(20),
      participation: { entryCurrencies: ['VE'] },
      prizeConfig: { drawMethod: 'RANDOM' },
    },
  ];

  const prizes = [
    {
      _id: oid(P.prize, 1),
      giveawayId: oid(P.giveaway, 1),
      name: 'iPhone 15 Pro 256GB',
      description: 'FICTIONAL physical prize.',
      imageRef: 'assets/dev/iphone15pro.svg',
      position: 1,
      winnerCount: 1,
      prizeType: 'PHYSICAL',
      claimType: 'FORM',
      entryCurrency: 'VE',
      entryAmount: 20,
      feeOverrides: [{ currency: 'SVE', amount: 15 }],
      claim: { windowDays: 7, requireKyc: true, physical: { shipToCountries: ['IN'], requirePhone: true } },
    },
    {
      _id: oid(P.prize, 2),
      giveawayId: oid(P.giveaway, 1),
      name: 'AirPods Pro (consolation tier)',
      position: 2,
      winnerCount: 2,
      prizeType: 'DIGITAL',
      claimType: 'DIGITAL_DELIVERY',
      entryCurrency: 'VE',
      entryAmount: 5,
      claim: { windowDays: 7, digital: { channel: 'IN_APP' } },
    },
    {
      _id: oid(P.prize, 3),
      giveawayId: oid(P.giveaway, 2),
      name: 'Swiggy Gold Voucher ₹5,000',
      position: 1,
      winnerCount: 3,
      prizeType: 'GIFT_CARD',
      claimType: 'DIGITAL_DELIVERY',
      entryCurrency: 'TOKEN',
      entryAmount: 40,
      claim: { windowDays: 5, digital: { channel: 'EMAIL', templateKey: 'dev-giftcard-email' } },
    },
    {
      _id: oid(P.prize, 4),
      giveawayId: oid(P.giveaway, 3),
      name: 'PlayStation 5 Slim',
      position: 1,
      winnerCount: 1,
      prizeType: 'PHYSICAL',
      claimType: 'FORM',
      entryCurrency: 'VE',
      entryAmount: 25,
      claim: { windowDays: 14, physical: { shipToCountries: ['IN'] } },
    },
    {
      _id: oid(P.prize, 5),
      giveawayId: oid(P.giveaway, 4),
      name: 'Sony WH-1000XM4 (historical)',
      position: 1,
      winnerCount: 1,
      prizeType: 'PHYSICAL',
      claimType: 'FORM',
      entryCurrency: 'VE',
      entryAmount: 10,
      claim: { windowDays: 10 },
    },
  ];

  // ----- participation + ledger (one row per user per event) ----------------
  const participations = [
    {
      _id: oid(P.participation, 1),
      userId: oid(P.user, 1),
      giveawayId: oid(P.giveaway, 1),
      prizeId: oid(P.prize, 1),
      entryCurrency: 'VE',
      entryAmount: 20,
      entryCount: 3,
      status: 'CONFIRMED',
      joinedAt: at(-2),
      rulesVersion: 'v1',
      transactionId: oid(P.txn, 1),
      transactionIds: [oid(P.txn, 1), oid(P.txn, 2)],
      deviceRef: { deviceHash: 'a1b2c3d4e5f60718293a4b5c', country: 'IN', clientClass: 'desktop-chrome' },
    },
    {
      _id: oid(P.participation, 2),
      userId: oid(P.user, 2),
      giveawayId: oid(P.giveaway, 1),
      prizeId: oid(P.prize, 2),
      entryCurrency: 'SVE',
      entryAmount: 15,
      entryCount: 1,
      status: 'CONFIRMED',
      joinedAt: at(-1),
      transactionId: oid(P.txn, 3),
      transactionIds: [oid(P.txn, 3)],
      deviceRef: { deviceHash: 'ffeeddccbbaa011223344556', country: 'IN', clientClass: 'mobile-safari' },
    },
    {
      _id: oid(P.participation, 3),
      userId: oid(P.user, 3),
      giveawayId: oid(P.giveaway, 1),
      entryCurrency: 'VE',
      entryAmount: 0,
      entryCount: 1,
      status: 'PENDING', // free entry, wallet call not settled yet
      joinedAt: at(0),
      deviceRef: { deviceHash: '0123456789abcdef01234567', country: 'IN' },
    },
    {
      _id: oid(P.participation, 4),
      userId: oid(P.user, 1),
      giveawayId: oid(P.giveaway, 3), // same user, DIFFERENT event — must be allowed
      prizeId: oid(P.prize, 4),
      entryCurrency: 'VE',
      entryAmount: 25,
      entryCount: 4,
      status: 'CONFIRMED',
      joinedAt: at(-20),
      transactionId: oid(P.txn, 4),
      transactionIds: [oid(P.txn, 4), oid(P.txn, 5)],
      deviceRef: { deviceHash: 'a1b2c3d4e5f60718293a4b5c', country: 'IN' },
    },
    {
      _id: oid(P.participation, 5),
      userId: oid(P.user, 2),
      giveawayId: oid(P.giveaway, 3),
      prizeId: oid(P.prize, 4),
      entryCurrency: 'VE',
      entryAmount: 25,
      status: 'REFUNDED', // fee was reversed by policy
      joinedAt: at(-25),
      transactionId: oid(P.txn, 6),
      transactionIds: [oid(P.txn, 6), oid(P.txn, 7)],
      voidReason: 'cancellation_refund',
    },
    {
      _id: oid(P.participation, 6),
      userId: oid(P.user, 4),
      giveawayId: oid(P.giveaway, 1),
      entryCurrency: 'VE',
      entryAmount: 20,
      status: 'VOIDED_FRAUD',
      joinedAt: at(-1),
      transactionId: oid(P.txn, 8),
      transactionIds: [oid(P.txn, 8)],
      voidReason: 'device_velocity_confirmed',
      deviceRef: { deviceHash: 'a1b2c3d4e5f60718293a4b5c', country: 'IN' },
    },
    {
      // user 2 taking part in the ARCHIVED event — the row that winner 2 refers to
      _id: oid(P.participation, 7),
      userId: oid(P.user, 2),
      giveawayId: oid(P.giveaway, 4),
      prizeId: oid(P.prize, 5),
      entryCurrency: 'VE',
      entryAmount: 10,
      entryCount: 1,
      status: 'CONFIRMED',
      joinedAt: at(-110),
    },
  ];

  // amount is a positive magnitude; direction carries the sign.
  const transactions = [
    {
      _id: oid(P.txn, 1),
      userId: oid(P.user, 1),
      giveawayId: oid(P.giveaway, 1),
      prizeId: oid(P.prize, 1),
      participationId: oid(P.participation, 1),
      currency: 'VE',
      amount: 20,
      direction: 'DEBIT',
      type: 'ENTRY_FEE',
      status: 'SUCCESS',
      balanceBefore: 150,
      balanceAfter: 130,
      transactionId: 'devtxn-0001',
      externalTransactionId: 'wlp-ext-0001',
      idempotencyKey: 'dev-entry-1-first',
      walletSource: 'SEED_FIXTURE',
      entriesGranted: 1,
    },
    {
      _id: oid(P.txn, 2),
      userId: oid(P.user, 1),
      giveawayId: oid(P.giveaway, 1),
      prizeId: oid(P.prize, 1),
      participationId: oid(P.participation, 1),
      currency: 'VE',
      amount: 20,
      direction: 'DEBIT',
      type: 'ENTRY_FEE',
      status: 'SUCCESS',
      balanceBefore: 130,
      balanceAfter: 110,
      transactionId: 'devtxn-0002',
      externalTransactionId: 'wlp-ext-0002',
      idempotencyKey: 'dev-entry-1-extra-2',
      walletSource: 'SEED_FIXTURE',
      entriesGranted: 2,
    },
    {
      _id: oid(P.txn, 3),
      userId: oid(P.user, 2),
      giveawayId: oid(P.giveaway, 1),
      prizeId: oid(P.prize, 2),
      participationId: oid(P.participation, 2),
      currency: 'SVE',
      amount: 15,
      direction: 'DEBIT',
      type: 'ENTRY_FEE',
      status: 'SUCCESS',
      balanceBefore: 60,
      balanceAfter: 45,
      transactionId: 'devtxn-0003',
      externalTransactionId: 'wlp-ext-0003',
      idempotencyKey: 'dev-entry-2-first',
      walletSource: 'SEED_FIXTURE',
      entriesGranted: 1,
    },
    {
      _id: oid(P.txn, 4),
      userId: oid(P.user, 1),
      giveawayId: oid(P.giveaway, 3),
      prizeId: oid(P.prize, 4),
      participationId: oid(P.participation, 4),
      currency: 'VE',
      amount: 25,
      direction: 'DEBIT',
      type: 'ENTRY_FEE',
      status: 'SUCCESS',
      balanceBefore: 110,
      balanceAfter: 85,
      transactionId: 'devtxn-0004',
      externalTransactionId: 'wlp-ext-0004',
      idempotencyKey: 'dev-entry-4-first',
      walletSource: 'SEED_FIXTURE',
      entriesGranted: 4,
    },
    {
      _id: oid(P.txn, 5),
      userId: oid(P.user, 1),
      giveawayId: oid(P.giveaway, 3),
      prizeId: oid(P.prize, 4),
      participationId: oid(P.participation, 4),
      currency: 'VE',
      amount: 25,
      direction: 'DEBIT',
      type: 'ENTRY_FEE',
      status: 'FAILED',
      failureReason: 'INSUFFICIENT_BALANCE',
      transactionId: 'devtxn-0005',
      idempotencyKey: 'dev-entry-4-retry-after-fail',
      walletSource: 'SEED_FIXTURE',
    },
    {
      _id: oid(P.txn, 6),
      userId: oid(P.user, 2),
      giveawayId: oid(P.giveaway, 3),
      prizeId: oid(P.prize, 4),
      participationId: oid(P.participation, 5),
      currency: 'VE',
      amount: 25,
      direction: 'DEBIT',
      type: 'ENTRY_FEE',
      status: 'REVERSED', // the original of txn 7
      balanceBefore: 90,
      balanceAfter: 65,
      transactionId: 'devtxn-0006',
      externalTransactionId: 'wlp-ext-0006',
      idempotencyKey: 'dev-entry-5-first',
      walletSource: 'SEED_FIXTURE',
      entriesGranted: 1,
    },
    {
      _id: oid(P.txn, 7),
      userId: oid(P.user, 2),
      giveawayId: oid(P.giveaway, 3),
      prizeId: oid(P.prize, 4),
      participationId: oid(P.participation, 5),
      currency: 'VE',
      amount: 25,
      direction: 'CREDIT',
      type: 'REVERSAL',
      status: 'SUCCESS',
      balanceBefore: 65,
      balanceAfter: 90,
      transactionId: `rev_devtxn-0006`,
      externalTransactionId: 'wlp-ext-0006-r',
      idempotencyKey: `reversal:${oid(P.txn, 6)}`,
      sourceTxnId: oid(P.txn, 6),
      walletSource: 'SEED_FIXTURE',
      authorizedBy: oid(P.user, 9),
      authorizationNote: 'policy: cancellation refund approved by ops (fictional)',
    },
    {
      _id: oid(P.txn, 8),
      userId: oid(P.user, 4),
      giveawayId: oid(P.giveaway, 1),
      prizeId: oid(P.prize, 1),
      participationId: oid(P.participation, 6),
      currency: 'VE',
      amount: 20,
      direction: 'DEBIT',
      type: 'ENTRY_FEE',
      status: 'PENDING', // held for fraud review; not settled
      transactionId: 'devtxn-0008',
      idempotencyKey: 'dev-entry-6-first',
      walletSource: 'SEED_FIXTURE',
    },
  ];

  const winners = [
    {
      _id: oid(P.winner, 1),
      giveawayId: oid(P.giveaway, 3),
      prizeId: oid(P.prize, 4),
      userId: oid(P.user, 1),
      participationId: oid(P.participation, 4),
      rank: 1,
      selection: {
        method: 'RANDOM',
        algorithmVersion: 'draw-v0',
        snapshotHash: '9f86d081884c7d65',
        seedHash: '4b1c3d2e5f6a7b8c',
        candidateCount: 412,
        entryCount: 1180,
        ticketRange: '0731-0731',
        drawnAt: at(-6),
        drawnBy: oid(P.user, 9),
      },
      announcementStatus: 'ANNOUNCED',
      announcedAt: at(-6),
      verificationStatus: 'VERIFIED',
      displayInfo: { maskedUserId: 'usr•••0001', displayAlias: 'Member #0001' },
      prizeSnapshot: { name: 'PlayStation 5 Slim', prizeType: 'PHYSICAL', claimType: 'FORM' },
    },
    {
      _id: oid(P.winner, 2),
      giveawayId: oid(P.giveaway, 4),
      prizeId: oid(P.prize, 5),
      userId: oid(P.user, 2),
      participationId: oid(P.participation, 7),
      rank: 1,
      selection: { method: 'RANDOM', algorithmVersion: 'draw-v0', drawnAt: at(-99), drawnBy: oid(P.user, 9), candidateCount: 90 },
      announcementStatus: 'PRIVATE_NOTIFIED',
      privateNotifiedAt: at(-98),
      verificationStatus: 'VERIFIED',
      displayInfo: { maskedUserId: 'usr•••0002', displayAlias: 'Member #0002' },
      prizeSnapshot: { name: 'Sony WH-1000XM4 (historical)', prizeType: 'PHYSICAL', claimType: 'FORM' },
    },
  ];

  const claims = [
    {
      _id: oid(P.claim, 1),
      winnerId: oid(P.winner, 1),
      giveawayId: oid(P.giveaway, 3),
      userId: oid(P.user, 1),
      prizeId: oid(P.prize, 4),
      claimType: 'FORM',
      prizeType: 'PHYSICAL',
      deadlineAt: at(8),
      status: 'SUBMITTED',
      submittedAt: at(-5),
      // FICTIONAL shipping data on purpose: 555-… numbers, example address.
      fulfillment: {
        physical: {
          fullName: 'Asha Developer',
          phone: '555-0100',
          address: '123 Fictional Lane, Plot 4B',
          city: 'Pune',
          state: 'MH',
          country: 'IN',
          postalCode: '411001',
        },
      },
    },
    {
      _id: oid(P.claim, 2),
      winnerId: oid(P.winner, 2),
      giveawayId: oid(P.giveaway, 4),
      userId: oid(P.user, 2),
      prizeId: oid(P.prize, 5),
      claimType: 'FORM',
      prizeType: 'PHYSICAL',
      deadlineAt: at(-30),
      status: 'EXPIRED', // never claimed in time — forfeiture handling is [PDF]
    },
  ];

  const fraudEvents = [
    {
      _id: oid(P.fraud, 1),
      type: 'DEVICE_VELOCITY',
      severity: 'HIGH',
      status: 'CONFIRMED',
      userId: oid(P.user, 4),
      giveawayId: oid(P.giveaway, 1),
      participationId: oid(P.participation, 6),
      deviceHash: 'a1b2c3d4e5f60718293a4b5c',
      country: 'IN',
      signal: { ruleKey: 'entries-per-device-per-hour', ruleVersion: 'v1', metric: 'entries_per_device_per_hour', observed: 9, threshold: 5, windowSeconds: 3600 },
      actionTaken: 'ENTRY_HELD',
      occurrenceCount: 4,
      resolvedAt: at(-1),
      resolvedBy: oid(P.user, 9),
      resolutionNote: 'confirmed: participation voided, fee held pending policy',
    },
    {
      _id: oid(P.fraud, 2),
      type: 'DUPLICATE_ATTEMPT',
      severity: 'LOW',
      status: 'OPEN',
      userId: oid(P.user, 2),
      giveawayId: oid(P.giveaway, 1),
      sessionHash: '77889900aabbccddeeff0011',
      signal: { ruleKey: 'repeat-idempotent-submit', metric: 'duplicate_submits', observed: 3, threshold: 3, windowSeconds: 60 },
      actionTaken: 'RATE_LIMITED',
    },
  ];

  const walletReferences = [
    { userId: oid(P.user, 1), currency: 'VE', balance: 85, source: 'SEED_FIXTURE', externalWalletId: 'dev-wallet-0001', observedAt: at(0), stale: false },
    { userId: oid(P.user, 1), currency: 'SVE', balance: 12, source: 'SEED_FIXTURE', externalWalletId: 'dev-wallet-0001', observedAt: at(0), stale: false },
    { userId: oid(P.user, 2), currency: 'VE', balance: 90, source: 'SEED_FIXTURE', observedAt: at(0), stale: false },
    { userId: oid(P.user, 3), currency: 'VE', balance: null, source: 'SEED_FIXTURE', observedAt: null, stale: true, lastErrorCode: 'WALLET_NOT_CONFIGURED' },
  ];

  const auditLogs = [
    {
      action: 'giveaway.status.update',
      entityType: 'Giveaway',
      entityId: oid(P.giveaway, 3),
      actorId: oid(P.user, 9),
      actorRole: 'admin',
      before: { status: 'ACTIVE' },
      after: { status: 'ENDED' },
      result: 'SUCCESS',
    },
    {
      action: 'participation.void',
      entityType: 'GiveawayParticipation',
      entityId: oid(P.participation, 6),
      actorId: oid(P.user, 9),
      actorRole: 'admin',
      before: { status: 'CONFIRMED' },
      after: { status: 'VOIDED_FRAUD' },
      reason: 'device_velocity_confirmed',
      result: 'SUCCESS',
    },
  ];

  return {
    SEED_VERSION,
    users,
    giveaways,
    prizes,
    participations,
    transactions,
    winners,
    claims,
    fraudEvents,
    walletReferences,
    auditLogs,
  };
}

/** Every row of every fixture collection carries the batch marker. */
function stamp(list) {
  return list.map((row) => ({ ...row, seedBatch: SEED_VERSION }));
}

module.exports = { SEED_VERSION, buildFixtures, stamp, oid };
