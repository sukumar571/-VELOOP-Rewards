/** authApi — the surface for authentication.
 *
 *  Three operations, all going through the same centralised `client.js`:
 *    • `signup({name,email,password})` → POST /auth/signup → { user, token }
 *    • `login({email,password})`       → POST /auth/login  → { user, token }
 *    • `me()`                          → GET  /auth/me     → verified principal
 *
 *  signup/login are UNAUTHENTICATED calls (no bearer attached) because they
 *  either create or exchange a credential. `me` REQUIRES a bearer and is the
 *  only honest source of "who am I": the token itself is just a credential
 *  until the server has verified its signature and resolved the account.
 */
import { get, post } from './client.js';

/**
 * Create a local email+password account. Resolves with `{ user, token }`;
 * throws `ApiClientError` on `EMAIL_TAKEN` (409) or `VALIDATION_ERROR` (400).
 */
export async function signup({ name, email, password } = {}) {
  const { data } = await post('/auth/signup', { name, email, password }, { auth: false });
  return data;
}

/**
 * Exchange email+password for a bearer token. The error shape is identical for
 * "unknown email" and "wrong password" (both 401 INVALID_CREDENTIALS) so the
 * UI can display one message without leaking which branch fired.
 */
export async function login({ email, password } = {}) {
  const { data } = await post('/auth/login', { email, password }, { auth: false });
  return data;
}

/** GET /auth/me -> { id, roles, name, email, scope, authProvider }. Throws
 *  ApiClientError(401) when there is no / an invalid / an expired token. */
export async function me() {
  const { data } = await get('/auth/me');
  return data;
}
