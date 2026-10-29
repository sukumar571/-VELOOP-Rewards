/**
 * auth — authenticates a bearer access token via the VELOOP auth adapter and
 * attaches the normalized principal to req.auth.
 *
 * `authenticate` hard-requires a valid token (401 otherwise). `optionalAuth`
 * attaches req.auth when a valid token is present but does NOT reject public
 * routes that also want user-specific state — the key never becomes a "if the
 * client sends it, we believe it" path because verification always runs here.
 */
const { verifyAccessToken } = require('../integrations/veloopAuth.js');
const { ApiError } = require('../utils/ApiError.js');

function extractBearer(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') return null;
  return token.trim();
}

function authenticate(req, res, next) {
  const token = extractBearer(req);
  if (!token) {
    return next(ApiError.unauthorized('Missing Bearer access token.'));
  }
  try {
    req.auth = verifyAccessToken(token);
    return next();
  } catch (err) {
    // ApiError from the adapter already carries the right 401 code/message.
    return next(err instanceof ApiError ? err : ApiError.unauthorized('Invalid access token.'));
  }
}

function optionalAuth(req, res, next) {
  const token = extractBearer(req);
  if (!token) return next();
  try {
    req.auth = verifyAccessToken(token);
  } catch (err) {
    // A bad token on a public route is simply treated as anonymous.
    req.auth = undefined;
  }
  return next();
}

module.exports = { authenticate, optionalAuth, extractBearer };
