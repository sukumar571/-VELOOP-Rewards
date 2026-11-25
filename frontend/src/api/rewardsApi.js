/**
 * rewardsApi — the native VELOOP reward wallet surface.
 *
 * Every amount, currency, eligibility decision and limit is decided by the
 * backend; the client only ever sends a code, an activity id or (as an
 * administrator) an explicit configuration value.
 */
import { get, post, patch, put } from './client.js';

/* ---- member -------------------------------------------------------------- */

/** GET /rewards/wallet -> { balances: {VE,SVE,TOKEN}, recentTransactions: [] } */
export async function wallet() {
  const { data } = await get('/rewards/wallet');
  return data;
}

/** GET /rewards/transactions -> { items, meta } */
export async function transactions(query = {}) {
  return get('/rewards/transactions', { query });
}

/** GET /rewards/activities -> { items } */
export async function activities() {
  const { data } = await get('/rewards/activities');
  return data;
}

/** POST /rewards/activities/:id/claim -> { activityId, title, currency, amount, balance } */
export async function claimActivity(activityId) {
  const { data } = await post(`/rewards/activities/${activityId}/claim`, {});
  return data;
}

/** GET /rewards/referral -> { code, link, enabled, reward, refereeReward, ... } */
export async function referral() {
  const { data } = await get('/rewards/referral');
  return data;
}

/** GET /rewards/codes -> { redemptionAvailable, codes } */
export async function codes() {
  const { data } = await get('/rewards/codes');
  return data;
}

/** POST /rewards/codes/validate -> { id, code, label, currency, amount, ... } */
export async function validateCode(code) {
  const { data } = await post('/rewards/codes/validate', { code });
  return data;
}

/** POST /rewards/codes/redeem -> { code, label, currency, amount, balance } */
export async function redeemCode(code) {
  const { data } = await post('/rewards/codes/redeem', { code });
  return data;
}

/** GET /rewards/redemptions -> { items } */
export async function redemptions() {
  const { data } = await get('/rewards/redemptions');
  return data;
}

/* ---- administrator ------------------------------------------------------- */

export async function adminStats() {
  const { data } = await get('/admin/rewards/stats');
  return data;
}

export async function adminActivities() {
  const { data } = await get('/admin/rewards/activities');
  return data;
}

export async function adminCreateActivity(body) {
  const { data } = await post('/admin/rewards/activities', body);
  return data;
}

export async function adminUpdateActivity(id, body) {
  const { data } = await patch(`/admin/rewards/activities/${id}`, body);
  return data;
}

export async function adminActivityClaims(id, query = {}) {
  return get(`/admin/rewards/activities/${id}/claims`, { query });
}

export async function adminCodes() {
  const { data } = await get('/admin/rewards/codes');
  return data;
}

export async function adminCreateCode(body) {
  const { data } = await post('/admin/rewards/codes', body);
  return data;
}

export async function adminUpdateCode(id, body) {
  const { data } = await patch(`/admin/rewards/codes/${id}`, body);
  return data;
}

export async function adminGenerateCodes(body) {
  const { data } = await post('/admin/rewards/codes/generate', body);
  return data;
}

export async function adminCodeRedemptions(id, query = {}) {
  return get(`/admin/rewards/codes/${id}/redemptions`, { query });
}

export async function adminRedemptions(query = {}) {
  return get('/admin/rewards/redemptions', { query });
}

export async function adminReferrals(query = {}) {
  return get('/admin/rewards/referrals', { query });
}

export async function adminReviewReferral(id, body) {
  const { data } = await post(`/admin/rewards/referrals/${id}/review`, body);
  return data;
}

export async function adminReferralConfig() {
  const { data } = await get('/admin/rewards/referral-config');
  return data;
}

export async function adminUpdateReferralConfig(body) {
  const { data } = await put('/admin/rewards/referral-config', body);
  return data;
}

export async function adminWallets(query = {}) {
  return get('/admin/rewards/wallets', { query });
}

export async function adminAdjustWallet(userId, body) {
  const { data } = await post(`/admin/rewards/wallets/${userId}/adjust`, body);
  return data;
}

export async function adminTransactions(query = {}) {
  return get('/admin/rewards/transactions', { query });
}
