/**
 * Admin routes — everything under /api/v1/admin is deny-by-default for admins only.
 *
 * The auth chain is `authenticate -> requireAdmin -> resolveIdentity -> requireAdmin`:
 * the token role is checked first (cheap, no I/O), then the store confirms the
 * role server-side and the SECOND requireAdmin uses that confirmed role. This is
 * what closes the "admin must be confirmed server-side" requirement.
 *
 * WRITE routes additionally use `requireResolvedIdentity`, so an action is always
 * attributed to a real account row (503 rather than an orphaned write if the store
 * is unreachable). READ routes omit it: they naturally return the honest 503 from
 * the data layer when the database is down, and one of them (/stats) is exercised
 * with the service mocked in the wiring tests.
 */
const express = require('express');
const { authenticate } = require('../../middleware/auth.js');
const { requireAdmin } = require('../../middleware/requireRole.js');
const { resolveIdentity, requireResolvedIdentity } = require('../../middleware/identity.js');
const { adminLimiter } = require('../../middleware/rateLimiter.js');
const { validate } = require('../../middleware/validate.js');

const admin = require('../../controllers/admin.controller.js');
const winner = require('../../controllers/winner.controller.js');
const review = require('../../controllers/review.controller.js');

const adminSchemas = require('../../validators/admin.validator.js');
const winnerSchemas = require('../../validators/winner.validator.js');
const claimSchemas = require('../../validators/claim.validator.js');
const reviewSchemas = require('../../validators/review.validator.js');

const router = express.Router();

router.use(authenticate, requireAdmin, resolveIdentity, requireAdmin);

// ---- aggregate -------------------------------------------------------------
router.get('/stats', admin.stats);

// ---- giveaway configuration & lifecycle -----------------------------------
// Sensitive WRITE routes carry the dedicated admin budget; a burst is throttled
// and recorded as a NON-BLOCKING signal (an admin action is never silently refused
// by the fraud engine). Reads keep only the global limiter.
router.post('/giveaways', adminLimiter, requireResolvedIdentity, validate({ body: adminSchemas.createGiveawayBody }), admin.createGiveaway);
router.patch('/giveaways/:id', adminLimiter, requireResolvedIdentity, validate({ params: adminSchemas.idParam, body: adminSchemas.updateGiveawayBody }), admin.updateGiveaway);
router.get('/giveaways/:id/config', validate({ params: adminSchemas.idParam }), admin.getGiveawayConfig);
router.post('/giveaways/:id/publish', adminLimiter, requireResolvedIdentity, validate({ params: adminSchemas.idParam, body: adminSchemas.publishBody }), admin.publish);
router.post('/giveaways/:id/transition', adminLimiter, requireResolvedIdentity, validate({ params: adminSchemas.idParam, body: adminSchemas.transitionBody }), admin.transition);

// ---- prize configuration ---------------------------------------------------
router.post('/giveaways/:id/prizes', adminLimiter, requireResolvedIdentity, validate({ params: adminSchemas.idParam, body: adminSchemas.createPrizeBody }), admin.createPrize);
router.patch('/prizes/:id', adminLimiter, requireResolvedIdentity, validate({ params: adminSchemas.idParam, body: adminSchemas.updatePrizeBody }), admin.updatePrize);

// ---- participation & ledger oversight -------------------------------------
router.get('/participations', validate({ query: adminSchemas.participationsQuery }), admin.listParticipations);
router.get('/ledger', validate({ query: adminSchemas.ledgerQuery }), admin.listLedger);
router.post('/participations/:id/void', adminLimiter, requireResolvedIdentity, validate({ params: adminSchemas.idParam, body: adminSchemas.voidBody }), review.voidParticipation);

// ---- winners: draw, notify, publish, review --------------------------------
router.get('/giveaways/:id/winners', validate({ params: winnerSchemas.idParam, query: winnerSchemas.adminWinnersQuery }), winner.adminList);
router.post('/giveaways/:id/winners/draw', adminLimiter, requireResolvedIdentity, validate({ params: winnerSchemas.idParam, body: winnerSchemas.drawBody }), winner.draw);
router.post('/giveaways/:id/winners/notify', adminLimiter, requireResolvedIdentity, validate({ params: winnerSchemas.idParam, body: winnerSchemas.scopeBody }), winner.notify);
router.post('/giveaways/:id/winners/publish', adminLimiter, requireResolvedIdentity, validate({ params: winnerSchemas.idParam, body: winnerSchemas.scopeBody }), winner.publish);
router.patch('/winners/:id', adminLimiter, requireResolvedIdentity, validate({ params: winnerSchemas.idParam, body: winnerSchemas.verificationBody }), winner.setVerification);

// ---- claims review (expire sweep before the :id routes) -------------------
router.get('/claims', validate({ query: claimSchemas.adminListQuery }), admin.listClaims);
router.post('/claims/expire', adminLimiter, requireResolvedIdentity, validate({ body: claimSchemas.expireBody }), admin.expireClaims);
router.post('/claims/:id/review', adminLimiter, requireResolvedIdentity, validate({ params: claimSchemas.idParam, body: claimSchemas.reviewBody }), admin.reviewClaim);
router.post('/claims/:id/extend', adminLimiter, requireResolvedIdentity, validate({ params: claimSchemas.idParam, body: claimSchemas.extendBody }), admin.extendClaim);

// ---- fraud-event review ----------------------------------------------------
router.get('/fraud-events', validate({ query: reviewSchemas.fraudListQuery }), review.listFraud);
router.get('/fraud-events/:id', validate({ params: reviewSchemas.idParam }), review.getFraud);
router.post('/fraud-events/:id/decision', adminLimiter, requireResolvedIdentity, validate({ params: reviewSchemas.idParam, body: reviewSchemas.decisionBody }), review.decideFraud);
router.post('/fraud-events/:id/review', adminLimiter, requireResolvedIdentity, validate({ params: reviewSchemas.idParam, body: reviewSchemas.reviewClaimBody }), review.reviewFraud);

// ---- audit records ---------------------------------------------------------
router.get('/audit-logs', validate({ query: reviewSchemas.auditListQuery }), review.listAudit);
router.get('/audit-logs/:entityType/:entityId', validate({ params: reviewSchemas.entityHistoryParams, query: reviewSchemas.entityHistoryQuery }), review.entityHistory);

module.exports = router;
