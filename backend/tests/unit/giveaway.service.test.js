// Mock the models so the service's query-building logic is tested without a DB.
// The point of these tests is that the read paths filter/sort/project exactly as
// the visibility rule says — no fabricated data is involved anywhere.
jest.mock('../../src/models/giveaway.model.js');
jest.mock('../../src/models/prize.model.js');
jest.mock('../../src/models/giveawayParticipation.model.js');
jest.mock('../../src/models/giveawayEntryTransaction.model.js');

const mongoose = require('mongoose');
const Giveaway = require('../../src/models/giveaway.model.js');
const Prize = require('../../src/models/prize.model.js');
const GiveawayParticipation = require('../../src/models/giveawayParticipation.model.js');
const GiveawayEntryTransaction = require('../../src/models/giveawayEntryTransaction.model.js');
const service = require('../../src/services/giveaway.service.js');

/** A chainable Query stand-in: find().sort().skip().limit().select().lean() -> rows. */
function chainable(result) {
  const q = { calls: [] };
  for (const method of ['sort', 'skip', 'limit', 'select']) {
    q[method] = (arg) => {
      q.calls.push([method, arg]);
      return q;
    };
  }
  q.lean = () => Promise.resolve(result);
  return q;
}

const lastCall = (q, method) => (q.calls.find((c) => c[0] === method) || [])[1];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('giveaway.service query building (pure)', () => {
  it('restricts public callers to published draws via the published flag', () => {
    // Publication is a flag, not a lifecycle state — so UPCOMING/ARCHIVED draws
    // stay visible once published and unpublished ones never become visible.
    expect(service.buildFilter({ publishedOnly: true })).toEqual({ published: true });
    expect(service.buildFilter({})).toEqual({});
  });

  it('applies an explicit lifecycle status and the featured flag', () => {
    expect(service.buildFilter({ status: 'ENDED', featured: true, publishedOnly: true })).toEqual({
      published: true,
      status: 'ENDED',
      featured: true,
    });
    expect(service.buildFilter({ featured: false })).toEqual({ featured: false });
  });

  it('defaults sort to endAt desc (the countdown field the UI reads)', () => {
    expect(service.buildSort({})).toEqual({ endAt: -1 });
    expect(service.buildSort({ sort: 'createdAt', order: 'asc' })).toEqual({ createdAt: 1 });
    expect(service.buildSort({ sort: 'startAt', order: 'desc' })).toEqual({ startAt: -1 });
  });

  it('keeps configuration-only detail out of the public projection', () => {
    for (const hidden of ['prizeConfig', 'eligibility', 'participation.entryCurrencies', 'seedBatch', 'createdBy']) {
      expect(service.PUBLIC_PROJECTION).toContain(hidden);
    }
    expect(service.PUBLIC_PROJECTION.startsWith('-')).toBe(true);
  });
});

describe('giveaway.service.listGiveaways (against the mocked model)', () => {
  it('runs a paginated, projected query and returns items + meta', async () => {
    const rows = [{ _id: '1', title: 'A' }, { _id: '2', title: 'B' }];
    let used = null;
    Giveaway.find.mockImplementation((filter) => {
      used = chainable(rows);
      return used;
    });
    Giveaway.countDocuments.mockResolvedValue(41);

    const res = await service.listGiveaways({ page: 3, limit: 10, publishedOnly: true, sort: 'startAt', order: 'asc' });

    expect(Giveaway.find).toHaveBeenCalledTimes(1);
    expect(Giveaway.find.mock.calls[0][0]).toEqual({ published: true });
    expect(lastCall(used, 'sort')).toEqual({ startAt: 1 });
    expect(lastCall(used, 'skip')).toBe(20); // (page - 1) * limit
    expect(lastCall(used, 'limit')).toBe(10);
    expect(lastCall(used, 'select')).toBe(service.PUBLIC_PROJECTION);
    expect(res.items).toEqual(rows);
    expect(res.meta).toEqual({ page: 3, limit: 10, total: 41, totalPages: 5 });
  });

  it('never reports zero pages for an empty result', async () => {
    Giveaway.find.mockImplementation(() => chainable([]));
    Giveaway.countDocuments.mockResolvedValue(0);
    const res = await service.listGiveaways({});
    expect(res.meta).toEqual({ page: 1, limit: 20, total: 0, totalPages: 1 });
  });
});

describe('giveaway.service.getGiveawayById', () => {
  it('throws a 404 ApiError when the doc is missing', async () => {
    Giveaway.findById.mockImplementation(() => ({ lean: () => Promise.resolve(null) }));
    await expect(service.getGiveawayById(new mongoose.Types.ObjectId())).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('returns the real document when found', async () => {
    const doc = { _id: 'x', title: 'Found', status: 'ACTIVE', published: true };
    Giveaway.findById.mockImplementation(() => ({ lean: () => Promise.resolve(doc) }));
    await expect(service.getGiveawayById('507f1f77bcf86cd799439011')).resolves.toEqual(doc);
  });
});

describe('giveaway.service.listPrizes', () => {
  it('only reads active tiers of that giveaway, ordered by position', async () => {
    const rows = [{ _id: 'p2', position: 2 }, { _id: 'p1', position: 1 }];
    const q = chainable(rows);
    Prize.find.mockImplementation(() => q);

    const giveawayId = new mongoose.Types.ObjectId();
    const out = await service.listPrizes(giveawayId);

    expect(Prize.find.mock.calls[0][0]).toEqual({ giveawayId, active: true });
    expect(lastCall(q, 'sort')).toEqual({ position: 1 });
    expect(out).toEqual(rows);
  });
});

describe('giveaway.service.getCollectionStats', () => {
  it('aggregates real counts from every collection it reports', async () => {
    Giveaway.countDocuments.mockResolvedValue(12);
    Prize.countDocuments.mockResolvedValue(30);
    GiveawayParticipation.countDocuments.mockResolvedValue(4180);
    GiveawayEntryTransaction.countDocuments.mockResolvedValue(5002);

    const stats = await service.getCollectionStats();

    expect(stats).toEqual({ giveaways: 12, prizes: 30, participations: 4180, settledTransactions: 5002 });
    // Prize counts only active tiers; the ledger counts only settled (SUCCESS) rows.
    expect(Prize.countDocuments.mock.calls[0][0]).toEqual({ active: true });
    expect(GiveawayEntryTransaction.countDocuments.mock.calls[0][0]).toEqual({ status: 'SUCCESS' });
    expect(GiveawayParticipation.countDocuments.mock.calls[0][0]).toEqual({});
  });

  it('surfaces a database failure instead of inventing numbers', async () => {
    Giveaway.countDocuments.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.getCollectionStats()).rejects.toThrow(/ECONNREFUSED/);
  });
});
