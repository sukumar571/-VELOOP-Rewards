/**
 * giveaway.controller — thin HTTP layer over giveaway.service.
 * Reads pre-validated input from req.valid (populated by `validate`).
 */
const { asyncHandler } = require('../utils/asyncHandler.js');
const { ApiError } = require('../utils/ApiError.js');
const service = require('../services/giveaway.service.js');
const { ok } = require('../utils/respond.js');

function isAdmin(req) {
  return !!(req.auth && req.auth.roles && req.auth.roles.includes('admin'));
}

const list = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listGiveaways(req.valid.query);
  // `ok` runs every row through toPublic(), so `_id`/`__v` never reach a client
  // even though the lean() query returned them.
  return ok(res, items, meta);
});

/** An unpublished draw does not exist for non-admin callers (404, not 403). */
async function loadVisible(id, req) {
  const giveaway = await service.getGiveawayById(id);
  if (!isAdmin(req) && !giveaway.published) {
    throw ApiError.notFound('Giveaway not found.');
  }
  return giveaway;
}

const getById = asyncHandler(async (req, res) => {
  const giveaway = await loadVisible(req.valid.params.id, req);
  return ok(res, giveaway);
});

/** Prize tiers, including their fee configuration — public once published. */
const listPrizes = asyncHandler(async (req, res) => {
  await loadVisible(req.valid.params.id, req);
  const prizes = await service.listPrizes(req.valid.params.id);
  return res.status(200).json({
    data: prizes.map((p) => ({
      id: String(p._id),
      giveawayId: String(p.giveawayId),
      name: p.name,
      description: p.description || null,
      imageRef: p.imageRef || null,
      position: p.position,
      winnerCount: p.winnerCount,
      prizeType: p.prizeType,
      claimType: p.claimType,
      entryCurrency: p.entryCurrency,
      entryAmount: p.entryAmount,
      feeOverrides: p.feeOverrides || [],
    })),
  });
});

/** GET /api/v1/giveaways/current — the single draw open right now (404 if none). */
const current = asyncHandler(async (req, res) => ok(res, await service.getCurrent(req.valid.query || {})));

/** GET /api/v1/giveaways/previous — recently finished draws, newest first. */
const previous = asyncHandler(async (req, res) => {
  const { items, meta } = await service.getPrevious(req.valid.query || {});
  return ok(res, items, meta);
});

/** GET /api/v1/giveaways/by-slug/:slug — stable human key; unpublished is a 404 publicly. */
const bySlug = asyncHandler(async (req, res) =>
  ok(res, await service.getBySlug(req.valid.params.slug, { isAdmin: isAdmin(req) })));

module.exports = { list, getById, listPrizes, current, previous, bySlug };
