/**
 * Public giveaway routes.
 *
 * Visibility is enforced HERE, before the controller, and it is based on the
 * `published` flag rather than the lifecycle status: all four lifecycle states
 * (UPCOMING / ACTIVE / ENDED / ARCHIVED) are public once published, and none of
 * them are visible to a caller who is not an admin while unpublished.
 */
const express = require('express');
const { validate } = require('../../middleware/validate.js');
const { optionalAuth } = require('../../middleware/auth.js');
const giveaway = require('../../controllers/giveaway.controller.js');
const schemas = require('../../validators/giveaway.validator.js');

const router = express.Router();

/** Non-admin callers are constrained to published draws. */
function enforceVisibility(req, res, next) {
  const isAdmin = !!(req.auth && req.auth.roles.includes('admin'));
  if (!isAdmin) req.valid.query.publishedOnly = true;
  return next();
}

// GET /api/v1/giveaways?status=&featured=&sort=&order=&page=&limit=
router.get('/', optionalAuth, validate({ query: schemas.listQuery }), enforceVisibility, giveaway.list);

// GET /api/v1/giveaways/:id — an unpublished draw is a 404 for non-admins
// (decided in the controller, because it needs the loaded document).
router.get('/:id', optionalAuth, validate({ params: schemas.idParam }), giveaway.getById);

// GET /api/v1/giveaways/:id/prizes — the configured prize tiers (fees included)
router.get(
  '/:id/prizes',
  optionalAuth,
  validate({ params: schemas.idParam }),
  giveaway.listPrizes,
);

module.exports = router;
