/**
 * ============================================================================
 * ROUTE INTROSPECTION — the API's own list of what it registered.
 * ============================================================================
 * `GET /api/v1` builds its endpoint index from this, and a test compares the
 * published documentation against it. That is what makes the "do not document
 * unimplemented operations" requirement structural: the list cannot claim an
 * endpoint that express does not route, and a new route appears in the index the
 * moment it is mounted (documentation is then updated to match, or the test fails).
 *
 * Express 4 stores mounts as router layers whose `regexp` encodes the path prefix.
 * `prefixOf()` reverses that encoding defensively: anything it cannot parse
 * cleanly is reported as no prefix rather than guessed at.
 * ========================================================================= */

/** Reverse express's path-to-regexp encoding of a mount prefix. */
function prefixOf(re) {
  if (!re) return '';
  let s = String(re.source);
  s = s.replace(/\\\//g, '/'); // \/ -> /
  s = s.replace(/\(\?=[^)]*\)/g, ''); // drop lookaheads (?=...|...)
  s = s.replace(/\(\?:[^)]*\)\?/g, ''); // drop optional groups (?:...)?
  s = s.replace(/[\^$]/g, ''); // anchors
  s = s.replace(/\?$/g, ''); // trailing optional slash marker
  if (/[()|\\.*+[\]]/.test(s)) return ''; // unresolved syntax → no prefix claimed
  if (s === '/' || s === '') return '';
  return s.replace(/\/$/, '');
}

function collect(layers, base, out) {
  for (const layer of layers || []) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const p of paths) {
        for (const method of Object.keys(layer.route.methods)) {
          out.add(`${method.toUpperCase()} ${base}${p === '/' ? '' : p}`.replace(/ +$/, ''));
        }
      }
      continue;
    }
    if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      collect(layer.handle.stack, `${base}${prefixOf(layer.regexp)}`, out);
    }
  }
  return out;
}

/**
 * @param {import('express').Application|import('express').Router} appOrRouter
 * @returns {string[]} sorted "METHOD /path" list
 */
function listRoutes(appOrRouter) {
  const stack = appOrRouter?._router ? appOrRouter._router.stack : appOrRouter.stack;
  const set = collect(stack || [], '', new Set());
  return [...set].sort();
}

/** Route handlers registered for `METHOD path`, for "is this a real handler?" checks. */
function handlerCount(appOrRouter, method, path) {
  const want = `${method.toUpperCase()} ${path}`;
  const stack = appOrRouter?._router ? appOrRouter._router.stack : appOrRouter.stack;
  let found = 0;
  const walk = (layers, base) => {
    for (const layer of layers || []) {
      if (layer.route) {
        const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
        for (const p of paths) {
          for (const m of Object.keys(layer.route.methods)) {
            if (`${m.toUpperCase()} ${base}${p === '/' ? '' : p}` === want) found += 1;
          }
        }
      } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
        walk(layer.handle.stack, `${base}${prefixOf(layer.regexp)}`);
      }
    }
  };
  walk(stack || [], '');
  return found;
}

module.exports = { listRoutes, handlerCount, prefixOf };
