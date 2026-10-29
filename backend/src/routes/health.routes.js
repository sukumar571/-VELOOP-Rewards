const express = require('express');
const health = require('../controllers/health.controller.js');

const router = express.Router();

// Mounted at /health. Kept OUTSIDE the rate limiter so probes are never throttled.
router.get('/', health.liveness);
router.get('/ready', health.readiness);

module.exports = router;
