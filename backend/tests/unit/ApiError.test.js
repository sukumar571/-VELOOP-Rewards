const { ApiError } = require('../../src/utils/ApiError.js');

describe('ApiError', () => {
  it('carries statusCode, stable code and operational flag', () => {
    const err = new ApiError(418, 'TEAPOT', 'I am a teapot');
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe('TEAPOT');
    expect(err.message).toBe('I am a teapot');
    expect(err.isOperational).toBe(true);
    expect(err.name).toBe('ApiError');
  });

  it('maps static helpers to the documented status/code pairs', () => {
    expect(ApiError.unauthorized()).toMatchObject({ statusCode: 401, code: 'LOGIN_REQUIRED' });
    expect(ApiError.forbidden()).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(ApiError.notFound()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(ApiError.badRequest()).toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });
    expect(ApiError.tooLarge()).toMatchObject({ statusCode: 413, code: 'PAYLOAD_TOO_LARGE' });
    expect(ApiError.tooManyRequests()).toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
    expect(ApiError.unavailable()).toMatchObject({ statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(ApiError.internal()).toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' });
  });

  it('attaches structured validation details', () => {
    const err = new ApiError(400, 'VALIDATION_ERROR', 'Invalid', { email: 'Required' });
    expect(err.details).toEqual({ email: 'Required' });
  });
});
