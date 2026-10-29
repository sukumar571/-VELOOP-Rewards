/**
 * admin.controller — admin-only operations. `stats` performs real count
 * aggregations (no fabricated numbers) and is reachable only through
 * requireRole('admin'). It intentionally exposes nothing beyond aggregate counts.
 */
const { asyncHandler } = require('../utils/asyncHandler.js');
const service = require('../services/giveaway.service.js');

const stats = asyncHandler(async (req, res) => {
  const counts = await service.getCollectionStats();
  return res.status(200).json({
    data: { ...counts, asOf: new Date().toISOString() },
  });
});

module.exports = { stats };
