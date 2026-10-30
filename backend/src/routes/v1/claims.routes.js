/**
 * Claim routes — the WINNER's side of fulfilment.
 *
 * A claim-specific surface (rather than a giveaway-scoped POST /claim) because a
 * claim belongs to a WIN record, not a draw: a winner acts on the claim id the
 * system created for them, and the deadline/submit/review lifecycle is its own
 * resource. Everything is scoped to the verified caller.
 */
const express = require('express');
const { validate } = require('../../middleware/validate.js');
const { authenticate } = require('../../middleware/auth.js');
const { resolveIdentity, requireResolvedIdentity } = require('../../middleware/identity.js');
const { claimLimiter } = require('../../middleware/rateLimiter.js');
const claim = require('../../controllers/claim.controller.js');
const schemas = require('../../validators/claim.validator.js');

const router = express.Router();

// All claim routes require a resolved identity (claims are ownership-scoped).
router.use(authenticate, resolveIdentity, requireResolvedIdentity);

// GET /api/v1/claims?status=&giveawayId=&page=&limit=
router.get('/', validate({ query: schemas.myClaimsQuery }), claim.myClaims);

// GET /api/v1/claims/:id
router.get('/:id', validate({ params: schemas.idParam }), claim.getClaim);

// POST /api/v1/claims/:id/submit — a dedicated budget; a burst is throttled and
// recorded as a non-blocking signal (never rejected by the fraud engine).
router.post('/:id/submit', claimLimiter, validate({ params: schemas.idParam, body: schemas.submitBody }), claim.submitClaim);

module.exports = router;
