/**
 * ============================================================================
 * RATE LIMITERS — enforcement, the sensitive-tier signal, and real wiring.
 * ============================================================================
 * Three things are asserted:
 *  1. Enforcement: `createLimiter` throttles and returns the stable 429 contract
 *     (proven on a mini app with `skip: () => false`; the app's OWN limiters stand
 *     down under NODE_ENV=test so the broad integration suites are unaffected).
 *  2. The sensitive-tier side effect: on a 429 from auth/entry/claim/admin, the
 *     burst is recorded as a NON-BLOCKING fraud signal (`respondAndSignal`) without
 *     changing the client's outcome.
 *  3. Wiring (identity introspection): the REAL routers mount the exported limiter
 *     singletons — a forgotten `claimLimiter`/`adminLimiter`/`authLimiter` on a
 *     route would fail this, independent of any counter behaviour.
 * ========================================================================= */
jest.mock('../../src/services/fraud.service.js', () => ({
  assessNonBlocking: jest.fn(() => Promise.resolve(null)),
}));

const express = require('express');
const request = require('supertest');

const fraud = require('../../src/services/fraud.service.js');
const rateLimiter = require('../../src/middleware/rateLimiter.js');
const { createLimiter, respondAndSignal, authLimiter, claimLimiter, adminLimiter } = rateLimiter;

// Build a minimal app so the limiter's behavior is asserted deterministically,
// independent of the global limit applied to the real app.
function makeApp(limit, handler) {
  const app = express();
  const limiter = createLimiter({ limit, windowMs: 60_000, skip: () => false, ...(handler ? { handler } : {}) });
  app.get('/limited', limiter, (req, res) => res.status(200).json({ ok: true }));
  return app;
}

/** Every middleware function handle a router runs, including inside its routes. */
function collectHandles(router) {
  const out = [];
  for (const layer of router.stack || []) {
    if (layer.route) {
      out.push(...layer.route.stack.map((l) => l.handle));
    } else if (typeof layer.handle === 'function') {
      out.push(layer.handle);
    }
  }
  return out;
}

describe('rate limiter', () => {
  it('allows requests up to the limit then returns 429 with RATE_LIMITED', async () => {
    const app = makeApp(2);
    await request(app).get('/limited').expect(200);
    await request(app).get('/limited').expect(200);
    const res = await request(app).get('/limited').expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('exposes standard rate-limit headers', async () => {
    const app = makeApp(5);
    const res = await request(app).get('/limited').expect(200);
    expect(res.headers).toHaveProperty('ratelimit-limit');
    expect(Number(res.headers['ratelimit-limit'])).toBe(5);
  });

  it('records a NON-BLOCKING fraud signal when a sensitive tier 429s', async () => {
    fraud.assessNonBlocking.mockClear();
    const app = makeApp(1, respondAndSignal);
    await request(app).get('/limited').expect(200);
    expect(fraud.assessNonBlocking).not.toHaveBeenCalled(); // allowed request: no signal
    await request(app).get('/limited').expect(429);
    expect(fraud.assessNonBlocking).toHaveBeenCalledTimes(1);
    expect(fraud.assessNonBlocking.mock.calls[0][0]).toMatchObject({ surface: 'rate_limit' });
  });
});

describe('the dedicated limiters are exported and mounted on the real routes', () => {
  it('auth/claim/admin limiters exist and carry rate-limit behaviour', () => {
    for (const [name, mw] of [['authLimiter', authLimiter], ['claimLimiter', claimLimiter], ['adminLimiter', adminLimiter]]) {
      expect(typeof mw).toBe('function');
      expect(typeof mw.resetKey).toBe('function'); // proves it is a real limiter instance
    }
  });

  it('the auth /me route mounts authLimiter', () => {
    const handles = collectHandles(require('../../src/routes/v1/auth.routes.js'));
    expect(handles).toContain(authLimiter);
  });

  it('the claim submit route mounts claimLimiter', () => {
    const handles = collectHandles(require('../../src/routes/v1/claims.routes.js'));
    expect(handles).toContain(claimLimiter);
  });

  it('the admin write routes mount adminLimiter', () => {
    const handles = collectHandles(require('../../src/routes/v1/admin.routes.js'));
    expect(handles).toContain(adminLimiter);
    // Every sensitive admin WRITE should carry it — at least the draw + lifecycle routes.
    const occurrences = handles.filter((h) => h === adminLimiter).length;
    expect(occurrences).toBeGreaterThanOrEqual(5);
  });
});
