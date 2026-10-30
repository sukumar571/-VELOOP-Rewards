/**
 * Giveaway routes: public reads, the caller's own entry state, and the entry
 * (money) path.
 *
 * Ordering matters: literal segments (/current, /previous, /my-status, /by-slug)
 * are registered BEFORE the parameterized /:id, otherwise express would feed
 * "current" to the ObjectId validator and answer 400 for a valid public route.
 *
 * Visibility is enforced HERE, before the controller, and is based on the
 * `published` flag rather than the lifecycle status: all four lifecycle states
 * (UPCOMING / ACTIVE / ENDED / ARCHIVED) are public once published, and none are
 * visible to a non-admin while unpublished.
 */
const express = require('express');
const { validate } = require('../../middleware/validate.js');
const { optionalAuth, authenticate } = require('../../middleware/auth.js');
const { resolveIdentity, requireResolvedIdentity } = require('../../middleware/identity.js');
const { entryLimiter } = require('../../middleware/rateLimiter.js');
const giveaway = require('../../controllers/giveaway.controller.js');
const winner = require('../../controllers/winner.controller.js');
const entry = require('../../controllers/participation.controller.js');
const schemas = require('../../validators/giveaway.validator.js');
const entrySchemas = require('../../validators/entry.validator.js');
const winnerSchemas = require('../../validators/winner.validator.js');

const router = express.Router();

/** Non-admin callers are constrained to published draws. */
function enforceVisibility(req, res, next) {
  const isAdmin = !!(req.auth && req.auth.roles && req.auth.roles.includes('admin'));
  if (!isAdmin) req.valid.query.publishedOnly = true;
  return next();
}

// ---- public reads ---------------------------------------------------------
// GET /api/v1/giveaways?status=&featured=&sort=&order=&page=&limit=
router.get('/', optionalAuth, validate({ query: schemas.listQuery }), enforceVisibility, giveaway.list);

// GET /api/v1/giveaways/current — the draw open right now.
router.get('/current', optionalAuth, validate({ query: schemas.listQuery }), giveaway.current);

// GET /api/v1/giveaways/previous?page=&limit= — finished draws.
router.get('/previous', optionalAuth, validate({ query: schemas.listQuery }), giveaway.previous);

// ---- authenticated user reads (before /:id so the literal wins) -----------
// GET /api/v1/giveaways/my-status — the caller's own entries.
router.get(
  '/my-status',
  authenticate,
  validate({ query: entrySchemas.myStatusQuery }),
  resolveIdentity,
  requireResolvedIdentity,
  entry.myStatus,
);

// GET /api/v1/giveaways/by-slug/:slug — stable human key.
router.get('/by-slug/:slug', optionalAuth, validate({ params: schemas.slugParam }), giveaway.bySlug);

// ---- parameterized /:id (registered last) ---------------------------------
// GET /api/v1/giveaways/:id — an unpublished draw is a 404 for non-admins.
router.get('/:id', optionalAuth, validate({ params: schemas.idParam }), giveaway.getById);

// GET /api/v1/giveaways/:id/prizes — the configured prize tiers (fees included).
router.get('/:id/prizes', optionalAuth, validate({ params: schemas.idParam }), giveaway.listPrizes);

// GET /api/v1/giveaways/:id/winners — announced, masked winners (paginated).
router.get('/:id/winners', optionalAuth, validate({ params: winnerSchemas.idParam, query: winnerSchemas.publicWinnersQuery }), winner.publicWinners);

// GET /api/v1/giveaways/:id/my-status — this caller's state for one draw.
router.get(
  '/:id/my-status',
  authenticate,
  validate({ params: entrySchemas.idParam }),
  resolveIdentity,
  requireResolvedIdentity,
  entry.giveawayStatus,
);

// POST /api/v1/giveaways/:id/join — the only endpoint that can move money.
// Validation runs immediately after `authenticate` so a malformed body is a 400
// before any database dependency; the throttle sits just before the write.
router.post(
  '/:id/join',
  authenticate,
  validate({ params: entrySchemas.idParam, body: entrySchemas.joinBody, headers: entrySchemas.joinHeaders }),
  resolveIdentity,
  requireResolvedIdentity,
  entryLimiter,
  entry.join,
);

module.exports = router;
