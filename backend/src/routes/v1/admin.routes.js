const express = require('express');
const { authenticate } = require('../../middleware/auth.js');
const { requireAdmin } = require('../../middleware/requireRole.js');
const admin = require('../../controllers/admin.controller.js');

const router = express.Router();

// Everything under /admin requires an authenticated admin (deny-by-default).
router.use(authenticate, requireAdmin);

// GET /api/v1/admin/stats — real aggregate counts, admin-only.
router.get('/stats', admin.stats);

module.exports = router;
