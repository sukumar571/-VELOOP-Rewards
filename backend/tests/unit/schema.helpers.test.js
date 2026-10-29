/**
 * ============================================================================
 * UNIT TESTS — pure helpers behind the migration runner and the delete guards
 * ============================================================================
 * These two helpers encode safety decisions that are easy to get subtly wrong,
 * and neither needs a database to prove:
 *  - indexFingerprint(): "is the index in the database the one the schema
 *    declared?" (a false 'no' means the runner churns indexes; a false 'yes'
 *    means a real invariant is silently missing)
 *  - isDocumentScopedDelete(): which guard is allowed to decide about a delete.
 * ========================================================================= */
const { indexFingerprint } = require('../../scripts/migrate.js');
const { isDocumentScopedDelete } = require('../../src/utils/schema.js');

describe('indexFingerprint() — declared vs. real', () => {
  it('ignores the index name and compares semantics only', () => {
    const declared = indexFingerprint({ key: { userId: 1, giveawayId: 1 }, unique: true });
    const real = indexFingerprint({ name: 'userId_1_giveawayId_1', key: { userId: 1, giveawayId: 1 }, unique: true, v: 2 });
    expect(declared).toBe(real);
    // Uniqueness is semantics, so a non-unique look-alike must NOT match.
    expect(indexFingerprint({ key: { userId: 1, giveawayId: 1 } })).not.toBe(declared);
  });

  it('recognises MongoDB\'s storage form of a text index', () => {
    // Declared in the schema…
    const declared = indexFingerprint({ key: { title: 'text', tagline: 'text' } });
    // …as the driver reports it after creation.
    const real = indexFingerprint({
      name: 'title_text_tagline_text',
      key: { _fts: 'text', _ftsx: 1 },
      weights: { title: 1, tagline: 1 },
    });
    expect(declared).toBe(real);
    // Different weighted fields are a different index.
    expect(indexFingerprint({ key: { title: 'text' } })).not.toBe(real);
  });

  it('keeps partial filter expressions and TTL in the comparison', () => {
    const partial = indexFingerprint({ key: { prizeId: 1, userId: 1 }, unique: true, partialFilterExpression: { duplicateAllowed: false } });
    expect(partial).toBe(indexFingerprint({ name: 'x', key: { prizeId: 1, userId: 1 }, unique: true, partialFilterExpression: { duplicateAllowed: false } }));
    expect(partial).not.toBe(indexFingerprint({ key: { prizeId: 1, userId: 1 }, unique: true }));

    const ttl = indexFingerprint({ key: { expiresAt: 1 }, name: 'ttl_expiresAt', expireAfterSeconds: 0 });
    expect(ttl).not.toBe(indexFingerprint({ key: { expiresAt: 1 } }));
  });
});

describe('isDocumentScopedDelete() — who decides about a delete', () => {
  /** Builds the shape Mongoose puts on the query it creates for `doc.deleteOne()`. */
  const hook = (name) => ({ fn: Object.defineProperty(() => {}, 'name', { value: name, configurable: true }) });
  const fakeQuery = (hookNames) => ({ _hooks: { _pres: { exec: hookNames.map(hook) } } });

  it('detects the query Mongoose builds for doc.deleteOne()', () => {
    expect(isDocumentScopedDelete(fakeQuery(['queryPreDeleteOne', 'callSubdocPreHooks', 'skipIfAlreadyDeleted']))).toBe(true);
  });

  it('does not treat an ordinary query delete as document-scoped', () => {
    expect(isDocumentScopedDelete(fakeQuery([]))).toBe(false);
    expect(isDocumentScopedDelete({ _hooks: { _pres: { exec: [{ fn: function custom() {} }] } } })).toBe(false);
  });

  it('fails closed on anything unexpected (never silently allow a delete)', () => {
    expect(isDocumentScopedDelete(undefined)).toBe(false);
    expect(isDocumentScopedDelete(null)).toBe(false);
    expect(isDocumentScopedDelete({})).toBe(false);
    expect(isDocumentScopedDelete({ _hooks: {} })).toBe(false);
    expect(isDocumentScopedDelete({ get _hooks() { throw new Error('exotic driver'); } })).toBe(false);
  });
});
