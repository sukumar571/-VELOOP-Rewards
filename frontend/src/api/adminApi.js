/**
 * adminApi.js — centralized HTTP client for all administrative endpoints.
 * All requests route through client.js which attaches Authorization: Bearer <token>.
 */
import { get, post, patch } from './client.js';

export async function getStats() {
  const { data } = await get('/admin/stats');
  return data;
}

export async function listGiveaways(query = {}) {
  return get('/admin/giveaways', { query });
}

export async function getGiveawayConfig(giveawayId) {
  const { data } = await get(`/admin/giveaways/${giveawayId}/config`);
  return data;
}

export async function createGiveaway(body) {
  const { data } = await post('/admin/giveaways', body);
  return data;
}

export async function updateGiveaway(giveawayId, body) {
  const { data } = await patch(`/admin/giveaways/${giveawayId}`, body);
  return data;
}

export async function setPublished(giveawayId, published, reason) {
  const { data } = await post(`/admin/giveaways/${giveawayId}/publish`, { published, reason });
  return data;
}

export async function transitionGiveaway(giveawayId, status, reason) {
  const { data } = await post(`/admin/giveaways/${giveawayId}/transition`, { status, reason });
  return data;
}

export async function createPrize(giveawayId, body) {
  const { data } = await post(`/admin/giveaways/${giveawayId}/prizes`, body);
  return data;
}

export async function updatePrize(prizeId, body) {
  const { data } = await patch(`/admin/prizes/${prizeId}`, body);
  return data;
}

export async function listParticipations(query = {}) {
  return get('/admin/participations', { query });
}

export async function voidParticipation(participationId, { mode = 'VOIDED_FRAUD', reason, refund = false }) {
  const { data } = await post(`/admin/participations/${participationId}/void`, { mode, reason, refund });
  return data;
}

export async function listLedger(query = {}) {
  return get('/admin/ledger', { query });
}

export async function listWinners(giveawayId, query = {}) {
  return get(`/admin/giveaways/${giveawayId}/winners`, { query });
}

export async function drawWinners(giveawayId, { prizeId, count }) {
  const { data } = await post(`/admin/giveaways/${giveawayId}/winners/draw`, { prizeId, count });
  return data;
}

export async function notifyWinners(giveawayId, { prizeId } = {}) {
  const { data } = await post(`/admin/giveaways/${giveawayId}/winners/notify`, { prizeId });
  return data;
}

export async function publishWinners(giveawayId, { prizeId } = {}) {
  const { data } = await post(`/admin/giveaways/${giveawayId}/winners/publish`, { prizeId });
  return data;
}

export async function setWinnerVerification(winnerId, { verificationStatus, reason }) {
  const { data } = await patch(`/admin/winners/${winnerId}`, { verificationStatus, reason });
  return data;
}

export async function listClaims(query = {}) {
  return get('/admin/claims', { query });
}

export async function reviewClaim(claimId, { status, note }) {
  const { data } = await post(`/admin/claims/${claimId}/review`, { status, note });
  return data;
}

export async function extendClaim(claimId, { days, until, reason }) {
  const { data } = await post(`/admin/claims/${claimId}/extend`, { days, until, reason });
  return data;
}

export async function expireClaims(giveawayId) {
  const { data } = await post('/admin/claims/expire', { giveawayId });
  return data;
}

export async function listFraudEvents(query = {}) {
  return get('/admin/fraud-events', { query });
}

export async function getFraudEvent(eventId) {
  const { data } = await get(`/admin/fraud-events/${eventId}`);
  return data;
}

export async function claimFraudEvent(eventId) {
  const { data } = await post(`/admin/fraud-events/${eventId}/review`, {});
  return data;
}

export async function decideFraudEvent(eventId, { decision, note }) {
  const { data } = await post(`/admin/fraud-events/${eventId}/decision`, { decision, note });
  return data;
}

export async function listAuditLogs(query = {}) {
  return get('/admin/audit-logs', { query });
}

export async function getEntityAuditHistory(entityType, entityId, query = {}) {
  return get(`/admin/audit-logs/${entityType}/${entityId}`, { query });
}

export async function listUsers(query = {}) {
  return get('/admin/users', { query });
}
