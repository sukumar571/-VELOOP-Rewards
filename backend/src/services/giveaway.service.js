/**
 * giveaway.service — real data access for the giveaway read endpoints.
 *
 * These are genuine Mongoose queries (no fake returns). When MongoDB is not
 * connected, bufferCommands is disabled so a query rejects fast and the error
 * handler surfaces an honest 503 — the endpoint never pretends to have data.
 *
 * Visibility rule: public listings only include draws whose `published` flag is
 * true. Publication is a flag, not one of the four lifecycle states, so asking
 * for `status=UPCOMING` cannot smuggle an unpublished draw into a public answer.
 */
const Giveaway = require('../models/giveaway.model.js');

const DEFAULT_SORT_FIELD = 'endAt';

function buildFilter({ status, featured, publishedOnly } = {}) {
  const filter = {};
  if (publishedOnly) filter.published = true;
  if (status) filter.status = status;
  if (typeof featured === 'boolean') filter.featured = featured;
  return filter;
}

function buildSort({ sort, order } = {}) {
  // `sort` arrives from a Zod enum, so no client string can inject a field.
  return { [sort || DEFAULT_SORT_FIELD]: order === 'asc' ? 1 : -1 };
}

/** Fields that are configuration/audit detail and stay off public responses. */
const PUBLIC_PROJECTION =
  '-participation.entryCurrencies -prizeConfig -eligibility -statusHistory -createdBy -updatedBy -seedBatch';

/**
 * Paginated giveaway list with pagination meta.
 */
async function listGiveaways(query = {}) {
  const filter = buildFilter(query);
  const sort = buildSort(query);
  const page = query.page || 1;
  const limit = query.limit || 20;
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Giveaway.find(filter).sort(sort).skip(skip).limit(limit).select(PUBLIC_PROJECTION).lean(),
    Giveaway.countDocuments(filter),
  ]);

  return {
    items,
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/** Fetch one giveaway by id or throw a 404. */
async function getGiveawayById(id) {
  const doc = await Giveaway.findById(id).lean();
  if (!doc) {
    const { ApiError } = require('../utils/ApiError.js');
    throw ApiError.notFound('Giveaway not found.');
  }
  return doc;
}

/** Prize tiers of a giveaway, ordered for display. */
async function listPrizes(giveawayId) {
  const Prize = require('../models/prize.model.js');
  return Prize.find({ giveawayId, active: true }).sort({ position: 1 }).lean();
}

/**
 * The draw that is open RIGHT NOW (spec: GET /giveaways/current).
 * `isOpenForEntries()` is the model's own rule; this is the same rule expressed
 * as a query so the database does the filtering: published + ACTIVE + inside the
 * window. The one closing soonest wins, because that is the draw a user should be
 * shown. When nothing matches, `NO_CURRENT_GIVEAWAY` is a real 404 — an empty
 * object would be indistinguishable from "there is a draw with no fields".
 */
async function getCurrent(query = {}) {
  const now = new Date();
  const filter = {
    published: true,
    status: 'ACTIVE',
    startAt: { $lte: now },
    endAt: { $gte: now },
  };
  if (query.featured !== undefined) filter.featured = query.featured;
  const doc = await Giveaway.find(filter).sort({ endAt: 1 }).limit(1).select(PUBLIC_PROJECTION).lean();
  const { domain } = require('../utils/domainErrors.js');
  if (!doc.length) throw domain('NO_CURRENT_GIVEAWAY');
  return doc[0];
}

/** Recently finished draws, newest first, paginated (spec: GET /giveaways/previous). */
async function getPrevious(query = {}) {
  const now = new Date();
  const page = query.page || 1;
  const limit = query.limit || 10;
  const filter = { published: true, status: { $in: ['ENDED', 'ARCHIVED'] }, endAt: { $lte: now } };
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Giveaway.find(filter).sort({ endAt: -1 }).skip(skip).limit(limit).select(PUBLIC_PROJECTION).lean(),
    Giveaway.countDocuments(filter),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}

/** Stable human key lookup. An unpublished slug is invisible to the public. */
async function getBySlug(slug, { isAdmin = false } = {}) {
  const doc = await Giveaway.findOne({ slug }).select(PUBLIC_PROJECTION).lean();
  const { domain } = require('../utils/domainErrors.js');
  if (!doc || (!isAdmin && !doc.published)) throw domain('GIVEAWAY_NOT_FOUND');
  return doc;
}

/** Admin KPI counts — real aggregate count queries over the collections. */
async function getCollectionStats() {
  const GiveawayParticipation = require('../models/giveawayParticipation.model.js');
  const GiveawayEntryTransaction = require('../models/giveawayEntryTransaction.model.js');
  const Prize = require('../models/prize.model.js');

  const [giveaways, prizes, participations, settledTransactions] = await Promise.all([
    Giveaway.countDocuments({}),
    Prize.countDocuments({ active: true }),
    GiveawayParticipation.countDocuments({}),
    GiveawayEntryTransaction.countDocuments({ status: 'SUCCESS' }),
  ]);
  return { giveaways, prizes, participations, settledTransactions };
}

module.exports = {
  listGiveaways,
  getGiveawayById,
  listPrizes,
  getCurrent,
  getPrevious,
  getBySlug,
  getCollectionStats,
  buildFilter,
  buildSort,
  PUBLIC_PROJECTION,
};
