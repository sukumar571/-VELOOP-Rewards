/**
 * /api/v1 — the version router.
 *
 * The index at `GET /api/v1` is GENERATED from the live express router via
 * `listRoutes()`, not hand-typed. That makes "the route list matches the actual
 * registered endpoints" a structural guarantee: this object can never advertise
 * an operation express does not route, and a newly mounted route appears here
 * automatically. A test compares docs/API.md against the same introspection, so
 * an undocumented (or non-existent) endpoint fails CI.
 */
const express = require('express');
const { listRoutes } = require('../../utils/listRoutes.js');
const authRoutes = require('./auth.routes.js');
const giveawayRoutes = require('./giveaway.routes.js');
const walletRoutes = require('./wallet.routes.js');
const claimsRoutes = require('./claims.routes.js');
const adminRoutes = require('./admin.routes.js');

const router = express.Router();

// The index reports itself, so it must be defined before it is queried — but it
// reads the router AFTER every child is mounted (request time, not import time).
router.get('/', (req, res) => {
  const routes = listRoutes(router)
    .map((entry) => {
      const [method, ...rest] = entry.split(' ');
      const path = rest.join(' ');
      return `${method} /api/v1${path}`;
    })
    .sort();
  res.status(200).json({
    api: 'v1',
    count: routes.length,
    routes,
    notes: {
      authentication: 'Bearer access token verified by the VELOOP auth adapter (AUTH_MODE=jwt); a clearly isolated dev-mock adapter serves local/test only.',
      identity: 'userId is derived from the verified token, never from a request body.',
      errors: 'Non-sensitive domain codes (ALREADY_JOINED, GIVEAWAY_ENDED, INSUFFICIENT_BALANCE, LOGIN_REQUIRED, CLAIM_EXPIRED, …) with { error: { code, message, details? }, requestId }.',
    },
  });
});

router.use('/auth', authRoutes);
router.use('/giveaways', giveawayRoutes);
router.use('/wallet', walletRoutes);
router.use('/claims', claimsRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
