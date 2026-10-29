// Mock only the service boundary: this proves controllers/routes/validators wire
// correctly and return the service's data verbatim (i.e. NOT a hard-coded "ok"),
// and that the publication visibility rule is enforced before the service runs.
jest.mock('../../src/services/giveaway.service.js', () => {
  const actual = jest.requireActual('../../src/services/giveaway.service.js');
  return {
    buildFilter: actual.buildFilter,
    buildSort: actual.buildSort,
    PUBLIC_PROJECTION: actual.PUBLIC_PROJECTION,
    listGiveaways: jest.fn(async (query) => ({
      items: [{ id: 'a', title: 'iPhone 15 Pro Giveaway', status: 'ACTIVE', echoedPage: query.page }],
      meta: { page: query.page, limit: query.limit, total: 1, totalPages: 1 },
    })),
    // One published and one unpublished draw, so the controller's visibility
    // decision (404 vs 200 for a non-admin) is exercised for real.
    getGiveawayById: jest.fn(async (id) => {
      if (id === '507f1f77bcf86cd799439099') return { _id: id, id, title: 'Secret Draft Draw', status: 'UPCOMING', published: false };
      return { id, title: 'iPhone 15 Pro Giveaway', status: 'ACTIVE', published: true };
    }),
    listPrizes: jest.fn(async () => [
      {
        _id: '507f1f77bcf86cd7994390aa',
        giveawayId: '507f1f77bcf86cd799439011',
        name: 'iPhone 15 Pro',
        description: 'Fictional dev prize',
        imageRef: 'cdn/iphone.png',
        position: 1,
        winnerCount: 1,
        prizeType: 'PHYSICAL',
        claimType: 'FORM',
        entryCurrency: 'VE',
        entryAmount: 50,
        feeOverrides: [{ currency: 'TOKEN', amount: 40 }],
        claim: { digital: { codePoolId: 'pool-secret' } },
      },
    ]),
    getCollectionStats: jest.fn(async () => ({
      giveaways: 3, prizes: 7, participations: 128, settledTransactions: 141,
    })),
  };
});

const request = require('supertest');
const app = require('../../src/app.js');
const service = require('../../src/services/giveaway.service.js');
const { signAccessToken } = require('../../src/integrations/veloopAuth.js');

const bearer = (claims) => `Bearer ${signAccessToken(claims)}`;
const adminHeader = bearer({ sub: 'admin-1', roles: ['admin'] });

beforeEach(() => {
  service.listGiveaways.mockClear();
  service.getGiveawayById.mockClear();
  service.listPrizes.mockClear();
  service.getCollectionStats.mockClear();
});

describe('giveaway endpoints (service mocked)', () => {
  it('GET /giveaways returns the service data with pagination meta', async () => {
    const res = await request(app).get('/api/v1/giveaways?page=2&limit=5').expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ page: 2, limit: 5, total: 1 });
    // A public caller is constrained to published draws, decided at the route.
    expect(service.listGiveaways.mock.calls[0][0].publishedOnly).toBe(true);
  });

  it('an admin may list unpublished draws too', async () => {
    await request(app).get('/api/v1/giveaways').set('Authorization', adminHeader).expect(200);
    expect(service.listGiveaways.mock.calls[0][0].publishedOnly).toBeUndefined();
  });

  it('rejects an unknown lifecycle status or sort field with 400', async () => {
    const bad = await request(app).get('/api/v1/giveaways?status=LIVE').expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    const sort = await request(app).get('/api/v1/giveaways?sort=passwordHash').expect(400);
    expect(sort.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /giveaways/:id returns the fetched document to everyone once published', async () => {
    const res = await request(app).get('/api/v1/giveaways/507f1f77bcf86cd799439011').expect(200);
    expect(res.body.data.title).toBe('iPhone 15 Pro Giveaway');
  });

  it('an unpublished draw does not exist for the public, but does for an admin', async () => {
    const hidden = '/api/v1/giveaways/507f1f77bcf86cd799439099';
    const anon = await request(app).get(hidden).expect(404);
    expect(anon.body.error.code).toBe('NOT_FOUND');
    const admin = await request(app).get(hidden).set('Authorization', adminHeader).expect(200);
    expect(admin.body.data.published).toBe(false);
  });

  it('GET /giveaways/:id/prizes returns the configured tiers without internal refs', async () => {
    const res = await request(app).get('/api/v1/giveaways/507f1f77bcf86cd799439011/prizes').expect(200);
    expect(res.body.data[0]).toMatchObject({
      id: '507f1f77bcf86cd7994390aa',
      position: 1,
      winnerCount: 1,
      prizeType: 'PHYSICAL',
      claimType: 'FORM',
      entryCurrency: 'VE',
      entryAmount: 50,
      feeOverrides: [{ currency: 'TOKEN', amount: 40 }],
    });
    // Fee config is public; the code-pool reference is not, and neither is _id.
    expect(res.body.data[0].claim).toBeUndefined();
    expect(res.body.data[0]._id).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/pool-secret/);
  });

  it('a prize list for an unpublished draw is a 404 for the public', async () => {
    await request(app).get('/api/v1/giveaways/507f1f77bcf86cd799439099/prizes').expect(404);
    expect(service.listPrizes).not.toHaveBeenCalled();
  });

  it('a malformed ObjectId is rejected before the service is consulted', async () => {
    const res = await request(app).get('/api/v1/giveaways/not-an-objectid').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(service.getGiveawayById).not.toHaveBeenCalled();
  });
});

describe('admin stats endpoint (service mocked)', () => {
  it('returns real aggregate counts to an admin', async () => {
    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', adminHeader)
      .expect(200);
    expect(res.body.data).toMatchObject({
      giveaways: 3, prizes: 7, participations: 128, settledTransactions: 141,
    });
    expect(typeof res.body.data.asOf).toBe('string');
  });

  it('refuses the same endpoint to a non-admin', async () => {
    await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', bearer({ sub: 'user-1', roles: ['user'] }))
      .expect(403);
    expect(service.getCollectionStats).not.toHaveBeenCalled();
  });

  it('refuses it outright with no credentials at all', async () => {
    await request(app).get('/api/v1/admin/stats').expect(401);
  });
});
