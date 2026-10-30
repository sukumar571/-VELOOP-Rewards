/**
 * admin.controller — the operator's configuration, lifecycle, oversight & review
 * surface. Everything here runs behind `authenticate -> requireAdmin ->
 * resolveIdentity -> requireAdmin`, so the caller is a store-confirmed admin and
 * `req.auth.userId` is a real account row to attribute actions to.
 *
 * The controller is intentionally thin: it hands validated input to the services,
 * which own the allow-listed writes, the fee/cross-object consistency checks, the
 * lifecycle transition table and the audit trail. Nothing here fabricates a result.
 */
const { asyncHandler } = require('../utils/asyncHandler.js');
const config = require('../services/adminGiveaway.service.js');
const claims = require('../services/claim.service.js');
const giveaway = require('../services/giveaway.service.js');
const { ok, created } = require('../utils/respond.js');

const actor = (req) => req.auth.userId;
const rid = (req) => req.id;

// ---- giveaway configuration ----------------------------------------------
const createGiveaway = asyncHandler(async (req, res) =>
  created(res, await config.createGiveaway({ body: req.valid.body, actorUserId: actor(req), requestId: rid(req) })));

const updateGiveaway = asyncHandler(async (req, res) =>
  ok(res, await config.updateGiveaway({ giveawayId: req.valid.params.id, body: req.valid.body, actorUserId: actor(req), requestId: rid(req) })));

const getGiveawayConfig = asyncHandler(async (req, res) => {
  const { giveaway: g, prizes } = await config.getGiveawayConfig(req.valid.params.id);
  return ok(res, { giveaway: g, prizes });
});

const publish = asyncHandler(async (req, res) => {
  const result = await config.setPublished({
    giveawayId: req.valid.params.id,
    published: req.valid.body.published,
    reason: req.valid.body.reason,
    actorUserId: actor(req),
    requestId: rid(req),
  });
  return ok(res, { changed: result.changed, published: result.published, giveaway: result.giveaway });
});

const transition = asyncHandler(async (req, res) => {
  const result = await config.transition({
    giveawayId: req.valid.params.id,
    status: req.valid.body.status,
    reason: req.valid.body.reason,
    actorUserId: actor(req),
    requestId: rid(req),
  });
  return ok(res, { changed: result.changed, status: result.status, giveaway: result.giveaway });
});

// ---- prizes ---------------------------------------------------------------
const createPrize = asyncHandler(async (req, res) => {
  const { prize } = await config.createPrize({ giveawayId: req.valid.params.id, body: req.valid.body, actorUserId: actor(req), requestId: rid(req) });
  return created(res, prize);
});

const updatePrize = asyncHandler(async (req, res) =>
  ok(res, await config.updatePrize({ prizeId: req.valid.params.id, body: req.valid.body, actorUserId: actor(req), requestId: rid(req) })));

// ---- participation / ledger oversight ------------------------------------
const listParticipations = asyncHandler(async (req, res) => {
  const { items, meta } = await config.listParticipations(req.valid.query);
  return ok(res, items, meta);
});

const listLedger = asyncHandler(async (req, res) => {
  const { items, meta } = await config.listLedger(req.valid.query);
  return ok(res, items, meta);
});

// ---- claims review ------------------------------------------------------
const listClaims = asyncHandler(async (req, res) => {
  const { items, meta } = await claims.adminListClaims(req.valid.query);
  return ok(res, items, meta);
});

const reviewClaim = asyncHandler(async (req, res) =>
  ok(res, await claims.reviewClaim({
    claimId: req.valid.params.id,
    status: req.valid.body.status,
    note: req.valid.body.note,
    actorUserId: actor(req),
    requestId: rid(req),
  })));

const extendClaim = asyncHandler(async (req, res) =>
  ok(res, await claims.extendClaim({
    claimId: req.valid.params.id,
    days: req.valid.body.days,
    until: req.valid.body.until,
    reason: req.valid.body.reason,
    actorUserId: actor(req),
    requestId: rid(req),
  })));

const expireClaims = asyncHandler(async (req, res) =>
  ok(res, await claims.expireOverdue({
    giveawayId: req.valid.body.giveawayId,
    actorUserId: actor(req),
    requestId: rid(req),
  })));

// ---- aggregate counts ---------------------------------------------------
const stats = asyncHandler(async (req, res) => {
  const counts = await giveaway.getCollectionStats();
  return ok(res, { ...counts, asOf: new Date().toISOString() });
});

module.exports = {
  createGiveaway,
  updateGiveaway,
  getGiveawayConfig,
  publish,
  transition,
  createPrize,
  updatePrize,
  listParticipations,
  listLedger,
  listClaims,
  reviewClaim,
  extendClaim,
  expireClaims,
  stats,
};
