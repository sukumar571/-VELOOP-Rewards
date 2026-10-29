/**
 * Request validators for the giveaway endpoints.
 * These enforce shape/range at the edge; the service still owns the actual query.
 */
const { z } = require('zod');
const { objectId, pagination, giveawayStatus } = require('./common.js');

const listQuery = z.object({
  status: giveawayStatus.optional(),
  featured: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  sort: z.enum(['endAt', 'startAt', 'createdAt', 'stats.participationCount']).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  ...pagination,
});

const idParam = z.object({ id: objectId });
const slugParam = z.object({ slug: z.string().min(1).max(120) });

module.exports = { listQuery, idParam, slugParam };
