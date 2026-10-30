/**
 * ============================================================================
 * CENTRALIZED API CLIENT — one fetch path for the whole app.
 * ============================================================================
 * Responsibilities (and ONLY these):
 *   1. Build a URL against the configured VITE_API_BASE_URL (`/api/v1`).
 *   2. Attach the Bearer credential from tokenStore when one exists.
 *   3. Parse the server envelope: success `{data, meta?}`; error
 *      `{error:{code,message,details?}, requestId}` (see backend respond.js /
 *      errorHandler.js).
 *   4. Raise a structured ApiClientError carrying {code, message, status,
 *      details} so service modules can map domain codes to the UI safely.
 *   5. On 401 (LOGIN_REQUIRED / TOKEN_EXPIRED / INVALID_TOKEN) clear the stored
 *      credential and notify subscribers so the app can react to an expired
 *      session WITHOUT ever surfacing the token or an internal error detail.
 *
 * It never logs or returns the token, and in production a 5xx is reduced to a
 * generic, safe message (the raw server `message` may contain internals).
 * ========================================================================= */
import { API_BASE_URL } from '../config/env.js';
import { getToken, clearToken } from './tokenStore.js';

export const UNAUTHORIZED_CODES = new Set([
  'LOGIN_REQUIRED',
  'TOKEN_EXPIRED',
  'INVALID_TOKEN',
  'UNAUTHORIZED',
]);

/** A network/HTTP failure with the server's stable, non-sensitive code. */
export class ApiClientError extends Error {
  constructor({ code, message, status, details, requestId }) {
    super(message || 'Request failed.');
    this.name = 'ApiClientError';
    this.code = code || 'NETWORK_ERROR';
    this.status = status ?? 0;
    this.details = details;
    this.requestId = requestId;
  }
}

function buildUrl(path, query) {
  const base = API_BASE_URL.replace(/\/+$/, '');
  let url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      qs.set(k, String(v));
    }
    const str = qs.toString();
    if (str) url += `?${str}`;
  }
  return url;
}

/**
 * Perform one request. Returns `{ data, meta }` (meta is undefined unless the
 * server sent it). Throws ApiClientError for any non-2xx or transport failure.
 */
export async function request(
  path,
  { method = 'GET', body, query, headers = {}, idempotencyKey, auth = true } = {},
) {
  const finalHeaders = new Headers(headers);
  if (body !== undefined) finalHeaders.set('content-type', 'application/json');
  if (auth) {
    const token = getToken();
    if (token) finalHeaders.set('authorization', `Bearer ${token}`);
  }
  if (idempotencyKey) finalHeaders.set('idempotency-key', idempotencyKey);

  let response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'omit', // Bearer-only backend; no cookies are relied upon
    });
  } catch {
    // Transport failure: never guess a success shape; surface a safe error.
    throw new ApiClientError({
      code: 'NETWORK_ERROR',
      message: 'We could not reach the service. Please check your connection and try again.',
      status: 0,
    });
  }

  const payload = await safeJson(response);

  if (response.ok) {
    return { data: payload?.data, meta: payload?.meta };
  }

  const err = payload?.error || {};
  const code = err.code || `HTTP_${response.status}`;

  // Expired / invalid session: drop the credential and notify, then throw a
  // normalized 401 the UI can act on — without leaking the token or internals.
  if (response.status === 401 || UNAUTHORIZED_CODES.has(code)) {
    clearToken();
    throw new ApiClientError({
      code,
      status: response.status,
      message: err.message || 'Your session has expired. Please sign in again.',
      requestId: payload?.requestId,
    });
  }

  throw new ApiClientError({
    code,
    status: response.status,
    message: safeMessage(err.message, response.status),
    details: err.details,
    requestId: payload?.requestId,
  });
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// A 5xx body may echo internals; in production only a generic message is shown.
function safeMessage(raw, status) {
  const isProd = import.meta.env.PROD === true;
  if (status >= 500 && isProd) {
    return 'Something went wrong on our side. Please try again shortly.';
  }
  return raw || 'The request could not be completed.';
}

export const get = (path, options) => request(path, { ...options, method: 'GET' });
export const post = (path, body, options) =>
  request(path, { ...options, method: 'POST', body });
