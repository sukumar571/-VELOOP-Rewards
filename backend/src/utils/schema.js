/**
 * Shared Mongoose schema helpers.
 *
 * Everything here exists so a safety rule is written ONCE and reused instead of
 * being re-implemented per model or scattered across controllers:
 *  - jsonOptions()    → consistent public serialization (`id`, no `_id`, no `__v`)
 *                       with declared private paths stripped by default
 *  - blockDelete()    → history-preserving deletion policy (no silent hard deletes)
 *  - immutableOnce()  → terminal/append-only records cannot be rewritten
 *  - hashReference()  → privacy-conscious device/session/IP references
 */
const crypto = require('crypto');

/** Non-enumerable, never-persisted marker holding the last saved state. */
const PERSISTED = Symbol('veloop.persisted');

/**
 * Consistent JSON output. `privatePaths` are removed unless the caller opts in
 * with `doc.toJSON({ includePrivate: true })` — which only server-side code that
 * has already authorized the reader may do. Paths may be dotted ('a.b.c') so a
 * single sensitive leaf inside an otherwise public config block can be dropped.
 */
function deletePath(target, dottedPath) {
  const parts = String(dottedPath).split('.');
  let node = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!node || typeof node !== 'object') return;
    node = node[parts[i]];
  }
  if (node && typeof node === 'object') delete node[parts[parts.length - 1]];
}

function jsonOptions({ privatePaths = [] } = {}) {
  return {
    virtuals: true,
    versionKey: false,
    transform(doc, ret, options) {
      ret.id = String(ret._id);
      delete ret._id;
      if (!options || !options.includePrivate) {
        for (const path of privatePaths) deletePath(ret, path);
      }
      return ret;
    },
  };
}

/** Plain toObject options (keeps `_id`, virtuals) for internal use. */
function objectOptions({ privatePaths = [] } = {}) {
  return {
    virtuals: true,
    versionKey: false,
    transform(doc, ret, options) {
      if (!options || !options.includePrivate) {
        for (const path of privatePaths) deletePath(ret, path);
      }
      return ret;
    },
  };
}

/**
 * Mongoose implements `doc.deleteOne()` by building an ordinary query and running
 * the DOCUMENT hooks from a query-level `pre('exec')` hook (see Model.prototype
 * .deleteOne). Our schema-level query guard fires after that hook chain, so it
 * would refuse every document delete and make the per-document `unless` rule below
 * unreachable. The document-built query is identifiable by the instance hooks
 * Mongoose attaches to it, so we detect it and let the document guard decide.
 *
 * Deliberately fail-closed: if a future Mongoose renames those hooks the check
 * returns false, the delete is refused with HISTORY_PROTECTED, and a test tells us.
 */
const DOCUMENT_DELETE_MARKERS = Object.freeze(['queryPreDeleteOne', 'callSubdocPreHooks', 'skipIfAlreadyDeleted']);
function isDocumentScopedDelete(query) {
  try {
    const pres = query && query._hooks && query._hooks._pres;
    if (!pres) return false;
    const hooks = typeof pres.get === 'function' ? pres.get('exec') : pres.exec;
    return (hooks || []).some((entry) => {
      const fn = typeof entry === 'function' ? entry : entry && entry.fn;
      return Boolean(fn) && DOCUMENT_DELETE_MARKERS.includes(fn.name);
    });
  } catch (err) {
    return false;
  }
}

/**
 * Refuses hard deletes so history/audit records can never vanish. Bulk query
 * deletes are refused too, unless a caller passes { overrideHistoryGuard: true }
 * — a capability reserved for the documented dev/reset scripts.
 */
function blockDelete(schema, { label = 'record', unless } = {}) {
  const message = `HISTORY_PROTECTED: ${label} records are retained. Change the status or write a compensating record instead of deleting.`;

  const docGuard = function docGuard(next) {
    if (typeof unless === 'function' && unless(this)) return next();
    return next(new Error(message));
  };
  const queryGuard = function queryGuard(next) {
    if (isDocumentScopedDelete(this)) return next(); // the document guard above already decided
    if (this.getOptions && this.getOptions().overrideHistoryGuard === true) return next();
    return next(new Error(message));
  };

  schema.pre('deleteOne', { document: true, query: false }, docGuard);
  schema.pre('deleteOne', { document: false, query: true }, queryGuard);
  schema.pre('deleteMany', { document: false, query: true }, queryGuard);
  schema.pre('findOneAndDelete', { document: false, query: true }, queryGuard);
}

/**
 * Freezes `paths` once `isTerminal(doc)` holds for the PERSISTED state, so a
 * completed charge can never be edited into a "refund" — a refund is a separate,
 * documented compensating record.
 */
function immutableOnce(schema, { paths, isTerminal, label = 'record' }) {
  const capture = function capture(doc) {
    Object.defineProperty(doc, PERSISTED, {
      value: isTerminal(doc),
      enumerable: false,
      configurable: true,
      writable: true,
    });
  };
  schema.post('init', capture);
  schema.post('save', capture);

  schema.pre('save', function guardImmutable(next) {
    // Creating a row directly in a terminal state is legal (imports, reversals);
    // only EDITING an existing terminal row is refused.
    if (this.isNew || !this.isModified(paths)) return next();
    const wasTerminal = typeof this[PERSISTED] === 'boolean' ? this[PERSISTED] : isTerminal(this);
    if (wasTerminal) {
      return next(new Error(`IMMUTABLE_FIELD: ${paths.join(', ')} are frozen on a terminal ${label}; write a compensating record instead.`));
    }
    return next();
  });
}

/**
 * Deterministic, salted, truncated hash — the privacy-conscious way to correlate
 * a device/session/IP across events without ever storing the raw value.
 */
function hashReference(value, salt = process.env.DEVICE_HASH_SALT || 'veloop-dev-salt-override-me') {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(`${salt}:${String(value)}`).digest('hex').slice(0, 32);
}

/**
 * Adds `seedBatch` to a schema so documents created by the DEV seed script can be
 * identified and removed precisely. Real records always have it null, which is
 * what makes `npm run seed:reset` safe: it can only ever delete fixture rows.
 */
function withSeedMarker(schema) {
  schema.add({ seedBatch: { type: String, default: null, index: true } });
  return schema;
}

module.exports = {
  jsonOptions,
  objectOptions,
  blockDelete,
  isDocumentScopedDelete,
  immutableOnce,
  hashReference,
  withSeedMarker,
  PERSISTED,
};
