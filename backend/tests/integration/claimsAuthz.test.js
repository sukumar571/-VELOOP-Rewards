/**
 * ============================================================================
 * CLAIM AUTHORIZATION + LIFECYCLE — ownership is enforced with a 404, not a 403.
 * ============================================================================
 * A claim carries the winner's delivery details, so existence itself is private:
 * a non-owner asking for someone else's claim is told "not found", never "forbidden"
 * (a 403 would confirm the id is real and open an IDOR oracle). The tests prove:
 *   - non-owner GET / submit -> 404
 *   - the owner can submit valid digital details
 *   - a past deadline refuses the owner's submit with CLAIM_EXPIRED (410)
 *   - the operator sweep turns overdue NOT_SUBMITTED claims into EXPIRED (audited)
 *   - an extension is audited and re-opens exactly that claim
 * Claims are seeded directly so the assertions are about the CLAIM surface, not
 * the draw that would otherwise create them.
 * ========================================================================= */
jest.setTimeout(180000);

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

const app = require('../../src/app.js');
const models = require('../../src/models/index.js');
const { config } = require('../../src/config/index.js');
const { signAccessToken } = require('../../src/integrations/veloopAuth.js');

const { User, PrizeClaim, AuditLog } = models;
const OVER = { overrideHistoryGuard: true };
const rid = () => Math.random().toString(36).slice(2, 10);
const bearer = (claims) => `Bearer ${signAccessToken(claims)}`;
const adminHeader = bearer({ sub: `admin-${rid()}`, roles: ['admin'] });

async function createWinnerUser() {
  const veloopId = `winner-${rid()}`;
  const user = await User.create({ veloopId, email: `${veloopId}@example.com`, roles: ['user'], status: 'ACTIVE' });
  return { user, header: bearer({ sub: veloopId }) };
}

/** A self-describing DIGITAL claim owned by `userId`. */
async function seedClaim({ userId, deadlineInMs = 7 * 86_400_000, status = 'NOT_SUBMITTED' }) {
  return PrizeClaim.create({
    winnerId: new mongoose.Types.ObjectId(),
    giveawayId: new mongoose.Types.ObjectId(),
    userId,
    prizeId: new mongoose.Types.ObjectId(),
    claimType: 'DIGITAL_DELIVERY',
    prizeType: 'DIGITAL',
    deadlineAt: new Date(Date.now() + deadlineInMs),
    status,
  });
}

let mongod;
let originalFraudEnabled;

beforeAll(async () => {
  mongoose.set('autoIndex', false);
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('veloop_claims_authz_test'), { serverSelectionTimeoutMS: 10000 });
  await Promise.all(Object.values(models).map((m) => m.syncIndexes()));
  originalFraudEnabled = config.security.fraud.enabled;
  config.security.fraud.enabled = false; // claim surfaces are non-blocking by design
});

afterAll(async () => {
  config.security.fraud.enabled = originalFraudEnabled;
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  for (const Model of Object.values(models)) await Model.deleteMany({}, OVER);
});

// ---------------------------------------------------------------------------
describe('claim ownership (404-not-403)', () => {
  it('a non-owner cannot read or submit another winner\'s claim', async () => {
    const owner = await createWinnerUser();
    const stranger = await createWinnerUser();
    const claim = await seedClaim({ userId: owner.user._id });

    const get = await request(app).get(`/api/v1/claims/${claim._id}`).set('Authorization', stranger.header);
    expect(get.status).toBe(404);
    expect(get.body.error.code).toBe('CLAIM_NOT_FOUND');

    const submit = await request(app)
      .post(`/api/v1/claims/${claim._id}/submit`)
      .set('Authorization', stranger.header)
      .send({ fulfillment: { digital: { deliveryEmail: 'snoop@example.com' } } });
    expect(submit.status).toBe(404);
    // The refusal never leaks that the id exists — no status echo, no owner hint.
    expect(JSON.stringify(submit.body)).not.toMatch(/NOT_SUBMITTED|owner/i);

    // And it did not move.
    expect((await PrizeClaim.findById(claim._id)).status).toBe('NOT_SUBMITTED');
  });

  it('the owner can read and submit valid digital details', async () => {
    const owner = await createWinnerUser();
    const claim = await seedClaim({ userId: owner.user._id });

    await request(app).get(`/api/v1/claims/${claim._id}`).set('Authorization', owner.header).expect(200);

    const res2 = await request(app)
      .post(`/api/v1/claims/${claim._id}/submit`)
      .set('Authorization', owner.header)
      .send({ fulfillment: { digital: { deliveryEmail: 'winner@example.com' } } })
      .expect(201);
    expect(res2.body.data.status).toBe('SUBMITTED');
    // The response masks the delivery target — the raw email is not echoed back.
    expect(JSON.stringify(res2.body)).not.toMatch(/winner@example\.com/);
  });

  it('the owner can submit valid PHYSICAL fulfilment (regression: field names must match the model)', async () => {
    const owner = await createWinnerUser();
    const claim = await PrizeClaim.create({
      winnerId: new mongoose.Types.ObjectId(),
      giveawayId: new mongoose.Types.ObjectId(),
      userId: owner.user._id,
      prizeId: new mongoose.Types.ObjectId(),
      claimType: 'FORM',
      prizeType: 'PHYSICAL',
      deadlineAt: new Date(Date.now() + 7 * 86_400_000),
      status: 'NOT_SUBMITTED',
    });

    const res = await request(app)
      .post(`/api/v1/claims/${claim._id}/submit`)
      .set('Authorization', owner.header)
      .send({
        fulfillment: {
          physical: {
            fullName: 'Asha Kumar',
            phone: '9876543210',
            address: '12 MG Road',
            city: 'Pune',
            state: 'Maharashtra',
            postalCode: '411001',
            country: 'in',
          },
        },
      })
      .expect(201);
    expect(res.body.data.status).toBe('SUBMITTED');
    // The raw street address must never be echoed back to the client.
    expect(JSON.stringify(res.body)).not.toMatch(/MG Road/);
  });

  it('a physical claim missing a model-required field is rejected with the missing keys', async () => {
    const owner = await createWinnerUser();
    const claim = await PrizeClaim.create({
      winnerId: new mongoose.Types.ObjectId(),
      giveawayId: new mongoose.Types.ObjectId(),
      userId: owner.user._id,
      prizeId: new mongoose.Types.ObjectId(),
      claimType: 'FORM',
      prizeType: 'PHYSICAL',
      deadlineAt: new Date(Date.now() + 7 * 86_400_000),
      status: 'NOT_SUBMITTED',
    });

    const res = await request(app)
      .post(`/api/v1/claims/${claim._id}/submit`)
      .set('Authorization', owner.header)
      .send({ fulfillment: { physical: { fullName: 'Asha', city: 'Pune' } } });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CLAIM_DETAILS_INVALID');
    expect(res.body.error.details.missing).toEqual(
      expect.arrayContaining(['address', 'state', 'postalCode', 'phone']),
    );
  });
});

// ---------------------------------------------------------------------------
describe('absolute deadline', () => {
  it('a late owner submit is CLAIM_EXPIRED (410) with no state change', async () => {
    const owner = await createWinnerUser();
    const claim = await seedClaim({ userId: owner.user._id, deadlineInMs: -60_000 }); // already past

    const res = await request(app)
      .post(`/api/v1/claims/${claim._id}/submit`)
      .set('Authorization', owner.header)
      .send({ fulfillment: { digital: { deliveryEmail: 'late@example.com' } } });
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('CLAIM_EXPIRED');
    expect((await PrizeClaim.findById(claim._id)).status).toBe('NOT_SUBMITTED');
  });
});

// ---------------------------------------------------------------------------
describe('operator lifecycle is audited', () => {
  it('the sweep expires overdue NOT_SUBMITTED claims and records the action', async () => {
    const a = await seedClaim({ userId: new mongoose.Types.ObjectId(), deadlineInMs: -1000 });
    const b = await seedClaim({ userId: new mongoose.Types.ObjectId(), deadlineInMs: 86_400_000 }); // still open
    await request(app).post('/api/v1/admin/claims/expire').set('Authorization', adminHeader).send({}).expect(200);

    expect((await PrizeClaim.findById(a._id)).status).toBe('EXPIRED');
    expect((await PrizeClaim.findById(b._id)).status).toBe('NOT_SUBMITTED');

    const audit = await AuditLog.findOne({ action: 'claim.expire_sweep' });
    expect(audit).not.toBeNull();
    expect(audit.actorRole).toBe('admin');
    expect(audit.after.expired).toBe(1);
  });

  it('extending a deadline is audited and re-opens exactly that claim', async () => {
    const owner = await createWinnerUser();
    const claim = await seedClaim({ userId: owner.user._id, deadlineInMs: -1000 });

    await request(app)
      .post(`/api/v1/admin/claims/${claim._id}/extend`)
      .set('Authorization', adminHeader)
      .send({ days: 3, reason: 'winner contacted support' })
      .expect(200);

    const audit = await AuditLog.findOne({ action: 'claim.deadline.extend', entityId: String(claim._id) });
    expect(audit).not.toBeNull();
    expect(audit.actorRole).toBe('admin');

    // Now the owner may submit — the extension is the only legitimate re-opening.
    await request(app)
      .post(`/api/v1/claims/${claim._id}/submit`)
      .set('Authorization', owner.header)
      .send({ fulfillment: { digital: { deliveryEmail: 'winner@example.com' } } })
      .expect(201);
  });
});
