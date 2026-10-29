/**
 * giveaway.controller — thin HTTP layer over giveaway.service.
 * Reads pre-validated input from req.valid (populated by `validate`).
 */
const { asyncHandler } = require('../utils/asyncHandler.js');
const { ApiError } = require('../utils/ApiError.js');
const service = require('../services/giveaway.service.js');

function isAdmin(req) {
  return !!(req.auth && req.auth.roles && req.auth.roles.includes('admin'));
}

const list = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listGiveaways(req.valid.query);
  return res.status(200).json({ data: items, meta });
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
  return res.status(200).json({ data: giveaway });
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

module.exports = { list, getById, listPrizes };
