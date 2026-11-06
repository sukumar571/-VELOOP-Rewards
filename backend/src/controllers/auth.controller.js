/**
 * auth.controller — three surfaces, one per concern:
 *
 *   • /me     — the authenticated principal derived from a VERIFIED bearer
 *               token (VELOOP-issued or a token we signed at signup/login).
 *               Reads exactly what the middleware proved and performs no DB
 *               lookup, so it keeps working even when MongoDB is briefly
 *               unreachable and honestly reports which adapter minted the
 *               credential (authProvider in the body).
 *   • /signup — create a LOCAL account in the app's MongoDB (see auth.service).
 *               Returns `{ user, token }` so the caller can immediately attach
 *               the bearer to subsequent requests.
 *   • /login  — exchange a local account's email+password for the same shape.
 *
 * The body uses the API-wide success envelope `{ data }` (utils/respond.js) so
 * every consumer — including the frontend client — parses one shape.
 */
const { ok, created } = require('../utils/respond.js');
const { asyncHandler } = require('../utils/asyncHandler.js');
const authService = require('../services/auth.service.js');

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

const signup = asyncHandler(async (req, res) => {
  const { name, email, password } = req.valid.body;
  const result = await authService.signup({ name, email, password });
  return created(res, result);
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.valid.body;
  const result = await authService.login({ email, password });
  return ok(res, result);
});

module.exports = { me, signup, login };
