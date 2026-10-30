/**
 * RESPONSE SHAPE unit tests — the one envelope every endpoint shares.
 * Proves `_id` never reaches a client, the pagination shape is fixed, and the
 * allow-list projection cannot be widened by an unexpected field.
 */
const {
  toPublic, normalize, paginationMeta, pick,
} = require('../../src/utils/respond.js');

describe('normalize / toPublic', () => {
  it('renames _id to id and drops internal bookkeeping', () => {
    const row = { _id: 'abc123', title: 'Draw', __v: 0, seedBatch: 'dev-fixture-v2' };
    const out = toPublic(row);
    expect(out).toEqual({ id: 'abc123', title: 'Draw' });
    expect(out._id).toBeUndefined();
    expect(out.__v).toBeUndefined();
    expect(out.seedBatch).toBeUndefined();
  });

  it('walks arrays and nested objects', () => {
    const out = toPublic([{ _id: '1', nested: { _id: '2', __v: 3 } }]);
    expect(out).toEqual([{ id: '1', nested: { id: '2' } }]);
  });

  it('serialises Date values to ISO strings', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    expect(normalize({ at: d }).at).toBe(d.toISOString());
  });

  it('leaves primitives and null untouched', () => {
    expect(normalize(null)).toBeNull();
    expect(normalize(5)).toBe(5);
    expect(normalize('x')).toBe('x');
  });
});

describe('paginationMeta', () => {
  it('is the only pagination shape and computes totalPages', () => {
    expect(paginationMeta({ page: 2, limit: 10, total: 45 })).toEqual({
      page: 2, limit: 10, total: 45, totalPages: 5,
    });
  });

  it('defaults sensibly and never reports zero pages', () => {
    expect(paginationMeta({ total: 0 })).toMatchObject({ page: 1, limit: 20, total: 0, totalPages: 1 });
  });
});

describe('pick (allow-list projection)', () => {
  it('keeps only the listed dotted paths', () => {
    const source = { a: 1, b: { c: 2, d: 3 }, secret: 'no' };
    expect(pick(source, ['a', 'b.c'])).toEqual({ a: 1, b: { c: 2 } });
  });

  it('skips paths that are absent or unreachable rather than inserting undefined keys', () => {
    // 'a' is a number, so 'a.deep' cannot resolve and is dropped; 'missing' never exists.
    expect(pick({ a: 1 }, ['missing', 'a.deep'])).toEqual({});
    expect(pick({ a: 1, b: { c: 2 } }, ['a', 'missing', 'b.c'])).toEqual({ a: 1, b: { c: 2 } });
  });
});
