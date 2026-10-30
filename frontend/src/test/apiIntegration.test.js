/**
 * ============================================================================
 * API INTEGRATION TESTS — the real (production) code path with fetch mocked.
 * ============================================================================
 * `setMockEnabled(false)` forces every service off the development mocks and
 * onto the centralized client, so these exercise the SAME request/normalize/map
 * code a deployed build runs. `global.fetch` is replaced with a faithful mock of
 * the Express `/api/v1` envelope (success {data,meta} / error {error,requestId}).
 * Coverage required by the brief: success, loading, error, expired session (401),
 * insufficient balance (402), duplicate participation (409), winner access,
 * claim submission — plus the honest empty state for unpublished results (409).
 * ========================================================================= */
import {
  get,
  ApiClientError,
} from '../api/client.js';
import { setToken, clearToken, getToken } from '../api/tokenStore.js';
import { setMockEnabled } from '../config/env.js';
import { toServiceError } from '../api/errors.js';
import * as giveawaysApi from '../api/giveawaysApi.js';
import * as participationApi from '../api/participationApi.js';
import * as winnersApi from '../api/winnersApi.js';
import * as claimsApi from '../api/claimsApi.js';
import { joinGiveaway, getGiveaways } from '../services/giveawayService.js';
import { submitClaim } from '../services/claimService.js';

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

/** Route a mocked call by URL substring, falling back to a 404 envelope. */
function mockRoutes(router) {
  return vi.fn(async (url) => {
    const result = router(url);
    const status = result.status ?? 200;
    if (status === 0) throw new Error('network down');
    return jsonResponse(status, result.body);
  });
}

// Drain the microtask/timer queue so a chained fetch resolves.
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  setMockEnabled(false); // exercise the API path, never the fictional mocks
  clearToken();
});

afterEach(() => {
  vi.unstubAllGlobals();
  setMockEnabled(true); // restore the default for the rest of the suite
  clearToken();
});

describe('client — success + request shaping', () => {
  it('parses the success envelope, returns meta, and attaches the Bearer credential', async () => {
    setToken('abc123');
    const fetchMock = mockRoutes(() => ({ body: { data: [{ id: 'gv1' }], meta: { page: 1 } } }));
    vi.stubGlobal('fetch', fetchMock);

    const { data, meta } = await get('/giveaways');

    expect(data).toEqual([{ id: 'gv1' }]);
    expect(meta).toEqual({ page: 1 });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/giveaways');
    expect(opts.credentials).toBe('omit'); // Bearer-only; no cookie reliance
    expect(opts.headers.get('authorization')).toBe('Bearer abc123');
  });
});

describe('client — loading state', () => {
  it('stays pending (loading) until the in-flight request settles', async () => {
    let resolveFetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((res) => { resolveFetch = res; })),
    );

    let settled = false;
    const p = get('/giveaways').then((r) => { settled = true; return r; });

    await settle();
    expect(settled).toBe(false); // still loading — no premature data

    resolveFetch(jsonResponse(200, { data: ['x'] }));
    const { data } = await p;
    expect(settled).toBe(true);
    expect(data).toEqual(['x']);
  });
});

describe('client — error + expired session', () => {
  it('throws ApiClientError for a 500 with a domain code', async () => {
    vi.stubGlobal('fetch', mockRoutes(() => ({
      status: 500,
      body: { error: { code: 'INTERNAL', message: 'db exploded' }, requestId: 'r1' },
    })));
    await expect(get('/giveaways')).rejects.toBeInstanceOf(ApiClientError);
  });

  it('maps a transport failure to a safe NETWORK_ERROR (never a fake success)', async () => {
    vi.stubGlobal('fetch', mockRoutes(() => ({ status: 0 })));
    const se = await joinGiveaway('gv1').catch((e) => e);
    // prizes fetch itself fails -> service surfaces a ServiceError, not a receipt
    expect(se).toBeInstanceOf(Error);
    expect(se.code).toBe('NETWORK_ERROR');
  });

  it('401 TOKEN_EXPIRED clears the stored credential and maps to NOT_AUTHENTICATED', async () => {
    setToken('stale-token');
    vi.stubGlobal('fetch', mockRoutes(() => ({
      status: 401,
      body: { error: { code: 'TOKEN_EXPIRED', message: 'Session expired' } },
    })));

    const err = await get('/auth/me').catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.code).toBe('TOKEN_EXPIRED');
    expect(getToken()).toBeNull(); // expired session drops the credential
    expect(toServiceError(err).code).toBe('NOT_AUTHENTICATED');
  });
});

describe('giveaway service — real API success path', () => {
  it('lists draws from the API and normalizes fee + participants + status', async () => {
    vi.stubGlobal('fetch', mockRoutes((url) => {
      if (url.includes('/prizes')) {
        return { body: { data: [{ id: 'p1', position: 1, prizeType: 'PHYSICAL', entryCurrency: 'VE', entryAmount: 25, winnerCount: 3 }] } };
      }
      return { body: { data: [{ id: 'gv1', slug: 'iphone-draw', title: 'iPhone Draw', status: 'ACTIVE', published: true, stats: { participationCount: 120 } }] } };
    }));

    const rows = await getGiveaways();
    expect(rows[0]).toMatchObject({
      id: 'gv1',
      status: 'active',
      participants: 120,
      winners: 3,
      entry: { currency: 'VE', amount: 25 },
      prizeId: 'p1',
    });
  });

  it('join returns the server receipt + authoritative balance and sends an Idempotency-Key', async () => {
    setToken('member-token');
    const fetchMock = mockRoutes((url) => {
      if (url.includes('/prizes')) {
        return { body: { data: [{ id: 'p1', position: 1, entryCurrency: 'VE', entryAmount: 25 }] } };
      }
      if (url.includes('/join')) {
        return { status: 201, body: { data: { participation: { id: 'part1' }, giveaway: { id: 'gv1', status: 'ACTIVE' }, prize: { id: 'p1' }, pricing: { currency: 'VE', unitAmount: 25, charged: 25 }, balance: { currency: 'VE', balance: 75 }, replayed: false } } };
      }
      return { status: 404, body: { error: { code: 'NOT_FOUND' } } };
    });
    vi.stubGlobal('fetch', fetchMock);

    const receipt = await joinGiveaway('gv1');
    expect(receipt.ok).toBe(true);
    expect(receipt.fee).toBe(25);
    expect(receipt.balanceAfter).toBe(75);
    expect(receipt.balanceBefore).toBe(100); // derived: after + charged

    const joinCall = fetchMock.mock.calls.find(([u]) => u.includes('/join'));
    const key = joinCall[1].headers.get('idempotency-key');
    expect(key).toMatch(/^[A-Za-z0-9_-]{16,128}$/); // fresh idempotency key per join
  });
});

describe('participation — authoritative failure codes are never shown as success', () => {
  const joinFail = (status, code) => {
    setToken('member-token');
    vi.stubGlobal('fetch', mockRoutes((url) => {
      if (url.includes('/prizes')) return { body: { data: [{ id: 'p1', position: 1, entryCurrency: 'VE', entryAmount: 25 }] } };
      if (url.includes('/join')) return { status, body: { error: { code, message: 'join refused' } } };
      return { status: 404, body: { error: { code: 'NOT_FOUND' } } };
    }));
    return joinGiveaway('gv1');
  };

  it('402 INSUFFICIENT_BALANCE -> ServiceError(INSUFFICIENT_BALANCE)', async () => {
    const se = await joinFail(402, 'INSUFFICIENT_BALANCE').catch((e) => e);
    expect(se).toBeInstanceOf(Error);
    expect(se.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('409 ALREADY_JOINED -> ServiceError(ALREADY_JOINED) (duplicate participation)', async () => {
    const se = await joinFail(409, 'ALREADY_JOINED').catch((e) => e);
    expect(se.code).toBe('ALREADY_JOINED');
  });
});

describe('winners — publication status governs what is displayed', () => {
  it('409 RESULTS_NOT_AVAILABLE becomes an honest empty list (no premature winner)', async () => {
    vi.stubGlobal('fetch', mockRoutes(() => ({
      status: 409,
      body: { error: { code: 'RESULTS_NOT_AVAILABLE', message: 'not published' } },
    })));
    const res = await winnersApi.forGiveaway('gv1');
    expect(res.items).toEqual([]);
    expect(res.giveaway).toBeNull();
  });

  it('a published draw returns only the masked winner rows', async () => {
    vi.stubGlobal('fetch', mockRoutes(() => ({
      body: {
        data: {
          giveaway: { id: 'gv1', title: 'iPhone Draw', slug: 'iphone-draw', status: 'ENDED' },
          items: [{ id: 'w1', rank: 1, prizeName: 'iPhone 15', display: { displayAlias: 'A•••', maskedUserId: 'VU-1234' }, announcedAt: '2026-10-01T00:00:00.000Z' }],
        },
      },
    })));
    const res = await winnersApi.forGiveaway('gv1');
    expect(res.items).toHaveLength(1);
    expect(res.items[0].display.maskedUserId).toBe('VU-1234');
  });
});

describe('claims — submission + winner-only authorization', () => {
  it('a winner submits fulfilment and the returned claim status is rendered', async () => {
    setToken('winner-token');
    const fetchMock = mockRoutes(() => ({
      status: 201,
      body: { data: { id: 'clm1', status: 'SUBMITTED', claimType: 'DIGITAL_DELIVERY' } },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await claimsApi.submit('clm1', { digital: { deliveryEmail: 'w@example.com' } });
    expect(res.status).toBe('SUBMITTED');
    expect(fetchMock.mock.calls[0][0]).toContain('/claims/clm1/submit');
  });

  it('a non-owner GET is answered 404 (existence not leaked) and maps to FORBIDDEN', async () => {
    setToken('loser-token');
    vi.stubGlobal('fetch', mockRoutes(() => ({
      status: 404,
      body: { error: { code: 'CLAIM_NOT_FOUND', message: 'Claim not found' } },
    })));
    const err = await claimsApi.getById('clm-other').catch((e) => e);
    expect(err.code).toBe('CLAIM_NOT_FOUND');
    // The claim-aware map turns the private 404 into a safe forbidden — never a
    // signal that the claim exists, and never an internal detail.
    expect(toServiceError(err, { claim: true }).code).toBe('FORBIDDEN');
  });

  it('submitting through the service with an invalid payload fails validation, not success', async () => {
    setToken('winner-token');
    vi.stubGlobal('fetch', mockRoutes((url) => {
      // No reachable claim for this giveaway -> the service cannot claim success.
      if (url.includes('/my-status')) return { body: { data: { giveawayId: 'gv1', isWinner: false, claim: null } } };
      return { status: 404, body: { error: { code: 'CLAIM_NOT_FOUND' } } };
    }));

    const se = await submitClaim('gv1', { fullName: 'Asha', city: 'Pune' }).catch((e) => e);
    expect(se).toBeInstanceOf(Error);
    // Non-winner / absent claim must never resolve as a submitted claim.
    expect(se.code).toBe('FORBIDDEN');
  });
});
