const express = require('express');
const { authenticate } = require('../../middleware/auth.js');
const { authLimiter } = require('../../middleware/rateLimiter.js');
const auth = require('../../controllers/auth.controller.js');

const router = express.Router();

// GET /api/v1/auth/me — identity asserted by the verified access token.
// Rate-limited like an authentication surface, AFTER the token is verified so the
// budget follows the subject (not just an IP). Repeated probing is throttled and
// recorded as a non-blocking signal.
router.get('/me', authenticate, authLimiter, auth.me);

module.exports = router;
