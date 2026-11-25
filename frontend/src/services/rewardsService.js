/**
 * ============================================================================
 * REWARDS SERVICE — the member + admin reward-programme surface.
 * ============================================================================
 * Thin, honest layer over api/rewardsApi.js. It never invents an amount or a
 * balance: every value comes from the server response. Domain errors are mapped
 * onto short, human messages while the machine `code` is preserved so a page
 * can branch on it (e.g. ALREADY_CLAIMED vs NOT_ELIGIBLE).
 * ========================================================================= */
import * as rewardsApi from '../api/rewardsApi.js';
import { ApiClientError } from '../api/client.js';

const MESSAGES = {
  REDEEM_CODE_INVALID: 'That code isn’t valid.',
  REDEEM_CODE_ALREADY_REDEEMED: 'This code has already been redeemed on your account.',
  REWARD_CODE_EXPIRED: 'This code has expired.',
  REWARD_CODE_NOT_STARTED: 'This code isn’t active yet.',
  REWARD_CODE_LIMIT_REACHED: 'This code has reached its redemption limit.',
  REWARD_ALREADY_CLAIMED: 'You’ve already claimed this reward for this period.',
  REWARD_CLAIM_LIMIT_REACHED: 'You’ve reached the claim limit for this activity.',
  REWARD_NOT_ELIGIBLE: 'You aren’t eligible for this reward yet.',
  REWARD_ACTIVITY_EXPIRED: 'This activity has ended.',
  REWARD_ACTIVITY_NOT_STARTED: 'This activity hasn’t started yet.',
  REWARD_ACTIVITY_INACTIVE: 'This activity is currently unavailable.',
  REWARD_ACTIVITY_NOT_FOUND: 'This activity no longer exists.',
  REWARD_ACTIVITY_EXISTS: 'An activity with that key already exists.',
  INSUFFICIENT_BALANCE: 'Your balance doesn’t cover this amount.',
  REFERRAL_INVALID_CODE: 'That referral code isn’t valid.',
  REFERRAL_SELF: 'You can’t refer yourself.',
  REFERRAL_DUPLICATE: 'This account has already been referred.',
  REFERRAL_LIMIT_REACHED: 'This account has reached its referral limit.',
  REFERRAL_NOT_FOUND: 'Referral not found.',
  REFERRAL_ALREADY_DECIDED: 'This referral has already been reviewed.',
  REWARD_CODE_EXISTS: 'That reward code already exists.',
  REWARD_CODE_IMMUTABLE: 'A reward code can’t be renamed.',
  REWARD_CODE_NOT_FOUND: 'Reward code not found.',
  USER_NOT_FOUND: 'Account not found.',
  VALIDATION_ERROR: 'Please check the values you entered.',
  FORBIDDEN: 'You don’t have permission to do that.',
  NETWORK_ERROR: 'We could not reach the service. Please check your connection.',
  RATE_LIMITED: 'Too many attempts — please wait a moment and try again.',
};

function fail(err, fallback) {
  const code = err instanceof ApiClientError ? err.code : err?.code;
  const status = err instanceof ApiClientError ? err.status : err?.status;
  const message =
    MESSAGES[code] ||
    (status && status < 500 && typeof err?.message === 'string' && err.message) ||
    fallback ||
    'Something went wrong. Please try again.';
  const out = new Error(message);
  out.code = code || 'SERVICE_ERROR';
  out.status = status;
  out.details = err?.details;
  return out;
}

/* ---- member -------------------------------------------------------------- */

export async function fetchWallet() {
  try {
    const data = await rewardsApi.wallet();
    return {
      balances: data?.balances || { VE: 0, SVE: 0, TOKEN: 0 },
      recentTransactions: data?.recentTransactions || [],
    };
  } catch (err) {
    throw fail(err, 'Your reward wallet could not be loaded.');
  }
}

export async function fetchTransactions(query = {}) {
  try {
    const res = await rewardsApi.transactions(query);
    return {
      items: res.data || [],
      meta: res.meta || { page: 1, limit: 20, total: 0, totalPages: 1 },
    };
  } catch (err) {
    throw fail(err, 'Your transaction history could not be loaded.');
  }
}

export async function fetchActivities() {
  try {
    const data = await rewardsApi.activities();
    return data?.items || [];
  } catch (err) {
    throw fail(err, 'Reward activities could not be loaded.');
  }
}

export async function claimActivity(id) {
  try {
    return await rewardsApi.claimActivity(id);
  } catch (err) {
    throw fail(err, 'That reward could not be claimed right now.');
  }
}

export async function fetchReferral() {
  try {
    return await rewardsApi.referral();
  } catch (err) {
    throw fail(err, 'Your referral details could not be loaded.');
  }
}

export async function fetchCodes() {
  try {
    const data = await rewardsApi.codes();
    return { redemptionAvailable: data?.redemptionAvailable !== false, codes: data?.codes || [] };
  } catch (err) {
    throw fail(err, 'Reward codes could not be loaded.');
  }
}

export async function validateCode(code) {
  try {
    return await rewardsApi.validateCode(code);
  } catch (err) {
    throw fail(err, 'That code could not be verified.');
  }
}

export async function redeemCode(code) {
  try {
    return await rewardsApi.redeemCode(code);
  } catch (err) {
    throw fail(err, 'That code could not be redeemed right now.');
  }
}

export async function fetchRedemptions() {
  try {
    const data = await rewardsApi.redemptions();
    return data?.items || [];
  } catch (err) {
    throw fail(err, 'Your redemptions could not be loaded.');
  }
}

/* ---- administrator ------------------------------------------------------- */

export async function fetchAdminStats() {
  try {
    return await rewardsApi.adminStats();
  } catch (err) {
    throw fail(err, 'Reward statistics could not be loaded.');
  }
}

export async function fetchAdminActivities() {
  try {
    const data = await rewardsApi.adminActivities();
    return data?.items || [];
  } catch (err) {
    throw fail(err, 'Reward activities could not be loaded.');
  }
}

export async function createActivity(body) {
  try {
    return await rewardsApi.adminCreateActivity(body);
  } catch (err) {
    throw fail(err, 'The activity could not be created.');
  }
}

export async function updateActivity(id, body) {
  try {
    return await rewardsApi.adminUpdateActivity(id, body);
  } catch (err) {
    throw fail(err, 'The activity could not be updated.');
  }
}

export async function fetchActivityClaims(id, query = {}) {
  try {
    const res = await rewardsApi.adminActivityClaims(id, query);
    return { items: res.data || [], meta: res.meta || {} };
  } catch (err) {
    throw fail(err, 'Activity claims could not be loaded.');
  }
}

export async function fetchAdminCodes() {
  try {
    const data = await rewardsApi.adminCodes();
    return data?.items || [];
  } catch (err) {
    throw fail(err, 'Reward codes could not be loaded.');
  }
}

export async function createCode(body) {
  try {
    return await rewardsApi.adminCreateCode(body);
  } catch (err) {
    throw fail(err, 'The reward code could not be created.');
  }
}

export async function updateCode(id, body) {
  try {
    return await rewardsApi.adminUpdateCode(id, body);
  } catch (err) {
    throw fail(err, 'The reward code could not be updated.');
  }
}

export async function generateCodes(body) {
  try {
    return await rewardsApi.adminGenerateCodes(body);
  } catch (err) {
    throw fail(err, 'Codes could not be generated.');
  }
}

export async function fetchCodeRedemptions(id, query = {}) {
  try {
    const res = await rewardsApi.adminCodeRedemptions(id, query);
    return { items: res.data || [], meta: res.meta || {} };
  } catch (err) {
    throw fail(err, 'Redemptions could not be loaded.');
  }
}

export async function fetchAdminRedemptions(query = {}) {
  try {
    const res = await rewardsApi.adminRedemptions(query);
    return { items: res.data || [], meta: res.meta || {} };
  } catch (err) {
    throw fail(err, 'Redemptions could not be loaded.');
  }
}

export async function fetchAdminReferrals(query = {}) {
  try {
    const res = await rewardsApi.adminReferrals(query);
    return { items: res.data || [], meta: res.meta || {} };
  } catch (err) {
    throw fail(err, 'Referrals could not be loaded.');
  }
}

export async function reviewReferral(id, body) {
  try {
    return await rewardsApi.adminReviewReferral(id, body);
  } catch (err) {
    throw fail(err, 'The referral decision could not be recorded.');
  }
}

export async function fetchReferralConfig() {
  try {
    return await rewardsApi.adminReferralConfig();
  } catch (err) {
    throw fail(err, 'The referral configuration could not be loaded.');
  }
}

export async function updateReferralConfig(body) {
  try {
    return await rewardsApi.adminUpdateReferralConfig(body);
  } catch (err) {
    throw fail(err, 'The referral configuration could not be saved.');
  }
}

export async function fetchWallets(query = {}) {
  try {
    const res = await rewardsApi.adminWallets(query);
    return { items: res.data || [], meta: res.meta || {} };
  } catch (err) {
    throw fail(err, 'Wallets could not be loaded.');
  }
}

export async function adjustWallet(userId, body) {
  try {
    return await rewardsApi.adminAdjustWallet(userId, body);
  } catch (err) {
    throw fail(err, 'The wallet adjustment could not be applied.');
  }
}

export async function fetchAdminTransactions(query = {}) {
  try {
    const res = await rewardsApi.adminTransactions(query);
    return { items: res.data || [], meta: res.meta || {} };
  } catch (err) {
    throw fail(err, 'Reward transactions could not be loaded.');
  }
}
