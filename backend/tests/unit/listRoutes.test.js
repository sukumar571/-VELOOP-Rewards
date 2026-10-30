/**
 * ROUTE INTROSPECTION unit tests — the mechanism behind "the route list matches
 * the actual registered endpoints". `GET /api/v1` and the docs test both rely on
 * listRoutes() reporting exactly what express will really route, so a documented
 * but non-existent operation is structurally impossible.
 */
const { listRoutes, handlerCount, prefixOf } = require('../../src/utils/listRoutes.js');

// The whole app is required (it performs no I/O at import time) so the list is
// derived from the live router, not a fixture.
const app = require('../../src/app.js');

describe('prefixOf', () => {
  const src = (s) => ({ source: s });

  it('recovers a plain mount prefix from express\'s encoded regexp', () => {
    // Mounting at /giveaways is encoded as ^\/giveaways with a lookahead boundary.
    expect(prefixOf(src('^\\/giveaways(?=\\/|\\/?$)'))).toBe('/giveaways');
  });

  it('claims no prefix for anything it cannot parse cleanly', () => {
    // An alternation left in the pattern means it was not a simple mount.
    expect(prefixOf(src('^\\/(a|b)'))).toBe('');
    expect(prefixOf(null)).toBe('');
    expect(prefixOf(src('^\\/$'))).toBe('');
  });
});

describe('listRoutes against the live app', () => {
  const routes = listRoutes(app);

  it('lists every method+path express registered, sorted and de-duplicated', () => {
    expect(routes).toEqual([...routes].sort());
    expect(new Set(routes).size).toBe(routes.length);
    expect(routes.every((r) => /^(GET|POST|PATCH|PUT|DELETE) \//.test(r))).toBe(true);
  });

  it('advertises the required public, user and admin surfaces', () => {
    const required = [
      'GET /api/v1/giveaways/current',
      'GET /api/v1/giveaways',
      'GET /api/v1/giveaways/previous',
      'GET /api/v1/giveaways/:id/winners',
      'GET /api/v1/giveaways/my-status',
      'GET /api/v1/wallet/balances',
      'POST /api/v1/giveaways/:id/join',
      'POST /api/v1/claims/:id/submit',
      'POST /api/v1/admin/giveaways',
      'PATCH /api/v1/admin/giveaways/:id',
      'POST /api/v1/admin/giveaways/:id/prizes',
      'POST /api/v1/admin/giveaways/:id/transition',
      'GET /api/v1/admin/participations',
      'POST /api/v1/admin/giveaways/:id/winners/draw',
      'POST /api/v1/admin/giveaways/:id/winners/publish',
      'POST /api/v1/admin/claims/:id/review',
      'GET /api/v1/admin/fraud-events',
      'GET /api/v1/admin/audit-logs',
    ];
    for (const r of required) expect(routes).toContain(r);
  });

  it('does not invent an endpoint express has not registered', () => {
    // There is no DELETE giveaway route and no login route in this API.
    expect(routes.some((r) => r.startsWith('DELETE '))).toBe(false);
    expect(routes).not.toContain('POST /api/v1/auth/login');
  });

  it('handlerCount reports the real number of handlers for a route', () => {
    expect(handlerCount(app, 'GET', '/api/v1/giveaways/current')).toBe(1);
    expect(handlerCount(app, 'POST', '/api/v1/giveaways/:id/join')).toBe(1);
    expect(handlerCount(app, 'GET', '/api/v1/nope')).toBe(0);
  });
});
