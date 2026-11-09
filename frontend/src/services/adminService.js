/**
 * adminService.js — Domain service for administrative operations.
 * Maps API responses, handles domain-level errors, and provides safe abstractions for the UI.
 */
import * as adminApi from '../api/adminApi.js';
import { ApiClientError } from '../api/client.js';

export async function fetchStats() {
  try {
    return await adminApi.getStats();
  } catch (err) {
    throw handleAdminError(err, 'Failed to load dashboard statistics.');
  }
}

export async function fetchGiveaways(query = {}) {
  try {
    const res = await adminApi.listGiveaways(query);
    return { items: res.data || [], meta: res.meta || {} };
  } catch (err) {
    throw handleAdminError(err, 'Failed to load giveaways.');
  }
}

export async function fetchGiveawayConfig(giveawayId) {
  try {
    return await adminApi.getGiveawayConfig(giveawayId);
  } catch (err) {
    throw handleAdminError(err, 'Failed to load giveaway configuration.');
  }
}

export async function createNewGiveaway(data) {
  try {
    return await adminApi.createGiveaway(data);
  } catch (err) {
    throw handleAdminError(err, 'Failed to create giveaway.');
  }
}

export async function modifyGiveaway(giveawayId, data) {
  try {
    return await adminApi.updateGiveaway(giveawayId, data);
  } catch (err) {
    throw handleAdminError(err, 'Failed to update giveaway.');
  }
}

export async function togglePublishGiveaway(giveawayId, published, reason = '') {
  try {
    return await adminApi.setPublished(giveawayId, published, reason);
  } catch (err) {
    throw handleAdminError(err, 'Failed to update publication status.');
  }
}

export async function changeGiveawayStatus(giveawayId, status, reason = '') {
  try {
    return await adminApi.transitionGiveaway(giveawayId, status, reason);
  } catch (err) {
    throw handleAdminError(err, 'Failed to transition giveaway status.');
  }
}

export async function addPrizeTier(giveawayId, prizeData) {
  try {
    return await adminApi.createPrize(giveawayId, prizeData);
  } catch (err) {
    throw handleAdminError(err, 'Failed to add prize tier.');
  }
}

export async function modifyPrizeTier(prizeId, prizeData) {
  try {
    return await adminApi.updatePrize(prizeId, prizeData);
  } catch (err) {
    throw handleAdminError(err, 'Failed to update prize tier.');
  }
}

export async function fetchParticipations(query = {}) {
  try {
    const res = await adminApi.listParticipations(query);
    return { items: res.data || [], meta: res.meta || {} };
  } catch (err) {
    throw handleAdminError(err, 'Failed to load participations.');
  }
}

export async function voidEntrantParticipation(participationId, { mode, reason, refund }) {
  try {
    return await adminApi.voidParticipation(participationId, { mode, reason, refund });
  } catch (err) {
    throw handleAdminError(err, 'Failed to void participation.');
  }
}

export async function fetchLedger(query = {}) {
  try {
    const res = await adminApi.listLedger(query);
    return { items: res.data || [], meta: res.meta || {} };
  } catch (err) {
    throw handleAdminError(err, 'Failed to load ledger transactions.');
  }
}

export async function fetchGiveawayWinners(giveawayId, query = {}) {
  try {
    const res = await adminApi.listWinners(giveawayId, query);
    return { items: res.data || [], meta: res.meta || {} };
  } catch (err) {
    throw handleAdminError(err, 'Failed to load giveaway winners.');
  }
}

export async function executeDraw(giveawayId, { prizeId, count }) {
  try {
    return await adminApi.drawWinners(giveawayId, { prizeId, count });
  } catch (err) {
    throw handleAdminError(err, 'Failed to execute winner draw.');
  }
}

export async function notifyDrawWinners(giveawayId, { prizeId } = {}) {
  try {
    return await adminApi.notifyWinners(giveawayId, { prizeId });
  } catch (err) {
    throw handleAdminError(err, 'Failed to notify winners.');
  }
}

export async function publishDrawWinners(giveawayId, { prizeId } = {}) {
  try {
    return await adminApi.publishWinners(giveawayId, { prizeId });
  } catch (err) {
    throw handleAdminError(err, 'Failed to publish winners.');
  }
}

export async function verifyWinner(winnerId, { verificationStatus, reason }) {
  try {
    return await adminApi.setWinnerVerification(winnerId, { verificationStatus, reason });
  } catch (err) {
    throw handleAdminError(err, 'Failed to update winner verification.');
  }
}

export async function fetchClaimsQueue(query = {}) {
  try {
    const res = await adminApi.listClaims(query);
    return { items: res.data || [], meta: res.meta || {} };
  } catch (err) {
    throw handleAdminError(err, 'Failed to load claims.');
  }
}

export async function updateClaimStatus(claimId, { status, note }) {
  try {
    return await adminApi.reviewClaim(claimId, { status, note });
  } catch (err) {
    throw handleAdminError(err, 'Failed to update claim review status.');
  }
}

export async function extendClaimDeadline(claimId, { days, until, reason }) {
  try {
    return await adminApi.extendClaim(claimId, { days, until, reason });
  } catch (err) {
    throw handleAdminError(err, 'Failed to extend claim deadline.');
  }
}

export async function sweepExpiredClaims(giveawayId) {
  try {
    return await adminApi.expireClaims(giveawayId);
  } catch (err) {
    throw handleAdminError(err, 'Failed to sweep expired claims.');
  }
}

export async function fetchFraudQueue(query = {}) {
  try {
    const res = await adminApi.listFraudEvents(query);
    return { items: res.data || [], meta: res.meta || {} };
  } catch (err) {
    throw handleAdminError(err, 'Failed to load fraud events.');
  }
}

export async function fetchFraudDetails(eventId) {
  try {
    return await adminApi.getFraudEvent(eventId);
  } catch (err) {
    throw handleAdminError(err, 'Failed to load fraud event details.');
  }
}

export async function claimFraudForReview(eventId) {
  try {
    return await adminApi.claimFraudEvent(eventId);
  } catch (err) {
    throw handleAdminError(err, 'Failed to claim fraud event for review.');
  }
}

export async function submitFraudDecision(eventId, { decision, note }) {
  try {
    return await adminApi.decideFraudEvent(eventId, { decision, note });
  } catch (err) {
    throw handleAdminError(err, 'Failed to record fraud decision.');
  }
}

export async function fetchAuditTrail(query = {}) {
  try {
    const res = await adminApi.listAuditLogs(query);
    return { items: res.data || [], meta: res.meta || {} };
  } catch (err) {
    throw handleAdminError(err, 'Failed to load audit logs.');
  }
}

export async function fetchAuditHistory(entityType, entityId, query = {}) {
  try {
    const res = await adminApi.getEntityAuditHistory(entityType, entityId, query);
    return { items: res.data || [], meta: res.meta || {} };
  } catch (err) {
    throw handleAdminError(err, 'Failed to load entity audit history.');
  }
}

export async function fetchUserList(query = {}) {
  try {
    const res = await adminApi.listUsers(query);
    return { items: res.data || [], meta: res.meta || {} };
  } catch (err) {
    throw handleAdminError(err, 'Failed to load user list.');
  }
}

function handleAdminError(err, fallbackMessage) {
  if (err instanceof ApiClientError) {
    const message = err.message || fallbackMessage;
    const error = new Error(message);
    error.code = err.code;
    error.status = err.status;
    error.details = err.details;
    return error;
  }
  return err instanceof Error ? err : new Error(fallbackMessage);
}
