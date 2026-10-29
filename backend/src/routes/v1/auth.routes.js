const express = require('express');
const { authenticate } = require('../../middleware/auth.js');
const auth = require('../../controllers/auth.controller.js');

const router = express.Router();

// GET /api/v1/auth/me — identity asserted by the verified access token.
router.get('/me', authenticate, auth.me);

module.exports = router;
