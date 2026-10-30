const jwt = require('jsonwebtoken');
const { config } = require('../../src/config/index.js');
const {
  signAccessToken,
  verifyAccessToken,
  extractRoles,
} = require('../../src/integrations/veloopAuth.js');

describe('veloopAuth — dev-mock mode (default in tests)', () => {
  it('round-trips a signed token into a normalized principal', () => {
    const token = signAccessToken({ sub: 'usr-1', roles: ['admin'], name: 'Ada' });
    const principal = verifyAccessToken(token);
    expect(principal.sub).toBe('usr-1');
    expect(principal.roles).toContain('admin');
    expect(principal.roles).toContain('user'); // every principal is at least 'user'
    expect(principal.name).toBe('Ada');
    expect(principal.provider).toBe('dev-mock');
  });

  it('rejects a missing token as LOGIN_REQUIRED', () => {
    expect(() => verifyAccessToken(undefined)).toThrow(
      expect.objectContaining({ code: 'LOGIN_REQUIRED', statusCode: 401 }),
    );
  });

  it('rejects a garbage token as INVALID_TOKEN', () => {
    expect(() => verifyAccessToken('not.a.jwt')).toThrow(
      expect.objectContaining({ code: 'INVALID_TOKEN', statusCode: 401 }),
    );
  });

  it('rejects a token with no subject', () => {
    const token = signAccessToken({ roles: ['user'] });
    expect(() => verifyAccessToken(token)).toThrow(
      expect.objectContaining({ code: 'INVALID_TOKEN' }),
    );
  });

  it('rejects an expired token as TOKEN_EXPIRED', () => {
    const expired = jwt.sign({ sub: 'usr-1', roles: ['user'] }, config.auth.devSecret, {
      algorithm: 'HS256',
      expiresIn: -5, // exp in the past
    });
    expect(() => verifyAccessToken(expired)).toThrow(
      expect.objectContaining({ code: 'TOKEN_EXPIRED', statusCode: 401 }),
    );
  });

  it('refuses to verify a token forged with a different secret', () => {
    const forged = jwt.sign({ sub: 'attacker', roles: ['admin'] }, 'someone-elses-secret', {
      algorithm: 'HS256',
      expiresIn: '5m',
    });
    expect(() => verifyAccessToken(forged)).toThrow(
      expect.objectContaining({ code: 'INVALID_TOKEN' }),
    );
  });

  describe('extractRoles', () => {
    it('reads roles, realm_roles and a single role claim, always including user', () => {
      expect(extractRoles({ roles: ['admin'] })).toEqual(['user', 'admin']);
      expect(extractRoles({ realm_roles: ['svc'] })).toEqual(['user', 'svc']);
      expect(extractRoles({ role: 'editor' })).toEqual(['user', 'editor']);
      expect(extractRoles({})).toEqual(['user']);
    });
  });
});

describe('veloopAuth — real jwt mode (HMAC verification seam)', () => {
  it('verifies tokens signed with the configured JWT secret', () => {
    jest.isolateModules(() => {
      process.env.AUTH_MODE = 'jwt';
      process.env.JWT_SECRET = 'unit-test-secret-value-with-enough-length';
      process.env.JWT_ALGORITHMS = 'HS256';
      const fresh = require('../../src/integrations/veloopAuth.js');
      const token = fresh.signAccessToken({ sub: 'usr-real', roles: ['user'] });
      const principal = fresh.verifyAccessToken(token);
      expect(principal.sub).toBe('usr-real');
      expect(principal.provider).toBe('jwt');
    });
  });

  it('rejects a token signed with a different secret', () => {
    jest.isolateModules(() => {
      process.env.AUTH_MODE = 'jwt';
      process.env.JWT_SECRET = 'unit-test-secret-value-with-enough-length';
      process.env.JWT_ALGORITHMS = 'HS256';
      const fresh = require('../../src/integrations/veloopAuth.js');
      const wrong = jwt.sign({ sub: 'x', roles: ['admin'] }, 'attacker-secret', {
        algorithm: 'HS256',
        expiresIn: '5m',
      });
      expect(() => fresh.verifyAccessToken(wrong)).toThrow(
        expect.objectContaining({ code: 'INVALID_TOKEN' }),
      );
    });
  });
});
