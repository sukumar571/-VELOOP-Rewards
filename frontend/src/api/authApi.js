/** authApi — the verified principal. Bearer credential only; identity is the
 *  server's answer to /auth/me, never a client-held claim. */
import { get } from './client.js';

/** GET /auth/me -> { id, roles, name, email, scope, authProvider }. Throws
 *  ApiClientError(401) when there is no / an invalid / an expired token. */
export async function me() {
  const { data } = await get('/auth/me');
  return data;
}
