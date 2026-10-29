/**
 * Reusable Zod primitives shared across request validators.
 */
const { z } = require('zod');
const mongoose = require('mongoose');
const { GIVEAWAY_STATUSES } = require('../config/constants.js');

const objectId = z
  .string()
  .refine((v) => mongoose.Types.ObjectId.isValid(v), { message: 'Invalid identifier.' });

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

const giveawayStatus = z.enum(GIVEAWAY_STATUSES);

module.exports = { objectId, pagination, giveawayStatus };
