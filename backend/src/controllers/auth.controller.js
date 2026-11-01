/**
 * auth.controller — the authenticated principal, derived from the VERIFIED token.
 *
 * /me returns exactly what the access token asserted (subject, roles, name,
 * email) after signature verification. It performs no database lookup because
 * the identity source is the (unconnected) VELOOP system; it therefore reports
 * the auth MODE explicitly so callers always know whether they are talking to a
 * real issuer or the local dev-mock. It never invents profile data.
 * The body uses the API-wide success envelope `{ data }` (see utils/respond.js)
 * so every consumer — including the frontend client — parses one shape.
 */
const { ok } = require('../utils/respond.js');

function me(req, res) {
  const { sub, roles, name, email, scope, provider } = req.auth;
  return ok(res, {
    id: sub,
    roles,
    name: name || null,
    email: email || null,
    scope: scope || null,
    authProvider: provider,
  });
}

module.exports = { me };
