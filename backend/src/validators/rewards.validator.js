/**
 * Request validators for the member reward endpoints.
 * Edge checks only: shape, bounds and enum membership. Eligibility, amounts,
 * limits and availability are decided by the services from stored configuration.
 */
const { z } = require('zod');
const { CURRENCIES, REWARD_TRANSACTION_TYPES } = require('../config/constants.js');
const { objectId, pagination } = require('./common.js');

const codeBody = z
  .object({
    code: z.string({ required_error: 'Enter a code.' }).trim().min(1, 'Enter a code.').max(40),
  })
  .strict();

const activityParams = z.object({ id: objectId }).strict();

const historyQuery = z
  .object({
    ...pagination,
    limit: z.coerce.number().int().min(1).max(100).default(20),
    currency: z.enum(CURRENCIES).optional(),
    type: z.enum(REWARD_TRANSACTION_TYPES).optional(),
  })
  .strict();

module.exports = { codeBody, activityParams, historyQuery };
