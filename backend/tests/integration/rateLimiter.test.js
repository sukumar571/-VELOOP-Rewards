const express = require('express');
const request = require('supertest');
const { createLimiter } = require('../../src/middleware/rateLimiter.js');

// Build a minimal app so the limiter's behavior is asserted deterministically,
// independent of the global limit applied to the real app.
function makeApp(limit) {
  const app = express();
  const limiter = createLimiter({ limit, windowMs: 60_000, skip: () => false });
  app.get('/limited', limiter, (req, res) => res.status(200).json({ ok: true }));
  return app;
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
});
