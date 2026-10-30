/**
 * ============================================================================
 * DOCS / ROUTER CONSISTENCY — "the route list matches the actual endpoints".
 * ============================================================================
 * The specification forbids documenting unimplemented operations as complete.
 * This test makes that structural: it extracts every `METHOD /api/v1/...`
 * endpoint from docs/API.md and requires the set to equal exactly what express
 * has registered. A route added without documentation, or a documented route that
 * does not exist, fails CI.
 * ========================================================================= */
const fs = require('fs');
const path = require('path');
const app = require('../../src/app.js');
const { listRoutes } = require('../../src/utils/listRoutes.js');

const DOC_PATH = path.join(__dirname, '..', '..', 'docs', 'API.md');

/** Every backtick-wrapped `METHOD /path` in the document, kept only for /api/v1. */
function endpointsFromDoc(markdown) {
  const re = /`(GET|POST|PATCH|PUT|DELETE) (\/[^`\s]+)`/g;
  const found = new Set();
  let m;
  while ((m = re.exec(markdown)) !== null) {
    const line = `${m[1]} ${m[2]}`;
    if (m[2].startsWith('/api/v1')) found.add(line);
  }
  return found;
}

describe('docs/API.md matches the live router', () => {
  const markdown = fs.readFileSync(DOC_PATH, 'utf8');
  const documented = endpointsFromDoc(markdown);
  const registered = new Set(
    listRoutes(app).filter((r) => r.includes(' /api/v1')),
  );

  it('is non-empty and every documented endpoint really exists', () => {
    expect(documented.size).toBeGreaterThan(0);
    const phantom = [...documented].filter((e) => !registered.has(e));
    expect(phantom).toEqual([]); // "documented but not implemented" ⇒ fail
  });

  it('documents every registered endpoint (no undocumented operations)', () => {
    const undocumented = [...registered].filter((e) => !documented.has(e));
    expect(undocumented).toEqual([]);
  });

  it('the two sets are identical in size', () => {
    expect(documented.size).toBe(registered.size);
  });
});
