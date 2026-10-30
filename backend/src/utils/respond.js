/**
 * ============================================================================
 * RESPONSE SHAPE — one envelope, one id convention, one pagination shape.
 * ============================================================================
 * Success bodies are always `{ data, meta? }`; errors are
 * `{ error: { code, message, details? }, requestId }` (see errorHandler).
 * Controllers therefore never invent a shape, and `_id` never reaches a client:
 *  - documents are serialized through their model's `toJSON()`, which already
 *    renames `_id` → `id`, drops `__v` and strips declared private paths;
 *  - `.lean()` rows (plain objects, no toJSON) go through `toPublic()` too, which
 *    performs the same rename and removes `_id`/`__v` for consistency.
 * ========================================================================= */

/** Depth-first normalization of plain rows: `_id` → `id`, `__v` removed. */
function normalize(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value !== 'object') return value;
  // A Mongoose document knows its own safe shape (private paths included).
  if (typeof value.toJSON === 'function' && value.$__ != null) return normalize(value.toJSON());

  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key === '__v' || key === 'seedBatch') continue; // internal bookkeeping
    if (key === '_id') {
      out.id = String(raw);
      continue;
    }
    out[key] = normalize(raw);
  }
  if (out.id === undefined && value.id !== undefined) out.id = String(value.id);
  return out;
}

/** One resource or a list of resources, always client-safe. */
function toPublic(resource) {
  return Array.isArray(resource) ? resource.map(normalize) : normalize(resource);
}

/** `{ page, limit, total, totalPages }` — the only pagination shape in the API. */
function paginationMeta({ page, limit, total }) {
  const perPage = Number(limit) || 20;
  return {
    page: Number(page) || 1,
    limit: perPage,
    total: Number(total) || 0,
    totalPages: Math.max(1, Math.ceil((Number(total) || 0) / perPage)),
  };
}

function send(res, status, data, meta) {
  return res.status(status).json(meta ? { data, meta } : { data });
}

const ok = (res, data, meta) => send(res, 200, toPublic(data), meta);
const created = (res, data, meta) => send(res, 201, toPublic(data), meta);
const accepted = (res, data, meta) => send(res, 202, toPublic(data), meta);

/**
 * Keep only the listed dotted paths — an allow-list, so a field added to a schema
 * later cannot silently start flowing out of an endpoint that was written to be
 * narrow. Used for the projection-style admin/analyst reads.
 */
function pick(source, paths) {
  const out = {};
  for (const path of paths) {
    const parts = String(path).split('.');
    let node = source;
    for (const part of parts) {
      if (node === null || node === undefined || typeof node !== 'object') {
        node = undefined;
        break;
      }
      node = node[part];
    }
    if (node === undefined) continue;
    const target = parts.slice(0, -1).reduce((n, p) => (n[p] = n[p] || {}), out);
    target[parts[parts.length - 1]] = node;
  }
  return out;
}

module.exports = { toPublic, normalize, paginationMeta, ok, created, accepted, pick, send };
