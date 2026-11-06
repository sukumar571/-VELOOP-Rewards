const express = require('express');
const { authenticate } = require('../../middleware/auth.js');
const { authLimiter } = require('../../middleware/rateLimiter.js');
const { validate } = require('../../middleware/validate.js');
const { signupBody, loginBody } = require('../../validators/auth.validator.js');
const auth = require('../../controllers/auth.controller.js');

const router = express.Router();

// POST /api/v1/auth/signup — create a LOCAL account. bcrypt-hashes the password
// and persists a User row (authProvider='local') in the MongoDB configured by
// MONGODB_URI. Returns 201 { user, token }. Rate-limited on the auth tier so a
// burst against this endpoint cannot hammer bcrypt.
router.post('/signup', authLimiter, validate({ body: signupBody }), auth.signup);

// POST /api/v1/auth/login — verify email+password, return a fresh bearer token
// and the public principal. Same shape as /signup. Invalid credentials produce
// 401 INVALID_CREDENTIALS without disclosing whether the email exists.
router.post('/login', authLimiter, validate({ body: loginBody }), auth.login);

// GET /api/v1/auth/me — identity asserted by the verified access token.
// Rate-limited like an authentication surface, AFTER the token is verified so the
// budget follows the subject (not just an IP). Repeated probing is throttled and
// recorded as a non-blocking signal.
router.get('/me', authenticate, authLimiter, auth.me);

module.exports = router;
