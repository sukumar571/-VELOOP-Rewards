const express = require('express');
const authRoutes = require('./auth.routes.js');
const giveawayRoutes = require('./giveaway.routes.js');
const adminRoutes = require('./admin.routes.js');

const router = express.Router();

// A truthful index of what this version actually implements (not a catch-all).
router.get('/', (req, res) => {
  res.status(200).json({
    api: 'v1',
    endpoints: {
      'GET /api/v1/auth/me': 'Authenticated principal (verified access token)',
      'GET /api/v1/giveaways': 'List published draws (filters: status, featured, sort, order, page, limit)',
      'GET /api/v1/giveaways/:id': 'Fetch a single draw',
      'GET /api/v1/admin/stats': 'Admin-only aggregate counts',
    },
    notYetImplemented:
      'Entry/money path, wallet, winner draw and claims are pending the project PDF ' +
      'and the external VELOOP auth/wallet systems (no credentials were provided).',
  });
});

router.use('/auth', authRoutes);
router.use('/giveaways', giveawayRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
