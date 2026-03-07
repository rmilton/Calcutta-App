const { db, DB_PATH } = require('./persistence/connection');
const { ensureSchema } = require('./persistence/schema');
const { ensureActiveSeason, seedSeasonData } = require('./persistence/seed');
const { applyPayoutModelV2Migration } = require('./persistence/migrations/payoutModelV2');

const seasonRepo = require('./persistence/repositories/seasonRepo');
const auctionRepo = require('./persistence/repositories/auctionRepo');
const eventRepo = require('./persistence/repositories/eventRepo');
const standingsRepo = require('./persistence/repositories/standingsRepo');
const providerSyncRepo = require('./persistence/repositories/providerSyncRepo');
const dashboardBriefingRepo = require('./persistence/repositories/dashboardBriefingRepo');

function init() {
  ensureSchema(db);

  const activeSeasonId = ensureActiveSeason(db);
  seedSeasonData(db, activeSeasonId);

  const payoutMigration = applyPayoutModelV2Migration(db, activeSeasonId);
  return {
    activeSeasonId,
    payoutModelMigrated: !!payoutMigration.migrated,
    payoutRandomAdjusted: (Number(payoutMigration.adjustedRandomDraws) || 0) > 0,
  };
}

function getActiveSeasonId() {
  return seasonRepo.getActiveSeasonId(db);
}

function getActiveSeason() {
  return seasonRepo.getActiveSeason(db);
}

function getSeason(id) {
  return seasonRepo.getSeason(db, id);
}

function getParticipantByToken(token) {
  return seasonRepo.getParticipantByToken(db, token);
}

function getSeasonParticipants(seasonId) {
  return seasonRepo.getSeasonParticipants(db, seasonId);
}

function getSeasonSettings(seasonId) {
  return seasonRepo.getSeasonSettings(db, seasonId);
}

function updateSeasonSettings(seasonId, patch) {
  return seasonRepo.updateSeasonSettings(db, seasonId, patch);
}

function getAuctionItems(seasonId) {
  return auctionRepo.getAuctionItems(db, seasonId);
}

function getActiveAuctionItem(seasonId) {
  return auctionRepo.getActiveAuctionItem(db, seasonId);
}

function getRecentBids(driverId, seasonId, limit = 10) {
  return auctionRepo.getRecentBids(db, driverId, seasonId, limit);
}

function getOwnership(seasonId) {
  return auctionRepo.getOwnership(db, seasonId);
}

function getOwnershipBySeason(seasonId) {
  return auctionRepo.getOwnershipBySeason(db, seasonId);
}

function getTotalPotCents(seasonId) {
  return auctionRepo.getTotalPotCents(db, seasonId);
}

function getAuctionCounts(seasonId) {
  return auctionRepo.getAuctionCounts(db, seasonId);
}

function getResolvedAuctionStatus(seasonId) {
  return auctionRepo.getResolvedAuctionStatus(db, seasonId);
}

function getParticipantSpendCents(seasonId, participantId) {
  return auctionRepo.getParticipantSpendCents(db, seasonId, participantId);
}

function getParticipantReservedBidCents(seasonId, participantId) {
  return auctionRepo.getParticipantReservedBidCents(db, seasonId, participantId);
}

function getParticipantAuctionBudgetSummary(seasonId, participantId, budgetCapCents) {
  return auctionRepo.getParticipantAuctionBudgetSummary(db, seasonId, participantId, budgetCapCents);
}

function getStandings(seasonId) {
  return standingsRepo.getStandings(db, seasonId);
}

function getParticipantPortfolio(seasonId, participantId) {
  return standingsRepo.getParticipantPortfolio(db, seasonId, participantId);
}

function getEvents(seasonId) {
  return eventRepo.getEvents(db, seasonId);
}

function getDrivers(seasonId) {
  return seasonRepo.getDrivers(db, seasonId);
}

function getEventById(seasonId, eventId) {
  return eventRepo.getEventById(db, seasonId, eventId);
}

function getEventResults(eventId) {
  return eventRepo.getEventResults(db, eventId);
}

function getEventPayoutRules(seasonId, eventType) {
  return eventRepo.getEventPayoutRules(db, seasonId, eventType);
}

function getSeasonBonusRules(seasonId) {
  return eventRepo.getSeasonBonusRules(db, seasonId);
}

function getEventPayouts(seasonId, eventId) {
  return eventRepo.getEventPayouts(db, seasonId, eventId);
}

function getProviderSyncStates(seasonId) {
  return providerSyncRepo.getProviderSyncStates(db, seasonId);
}

function upsertProviderSyncState(seasonId, scope, payload) {
  return providerSyncRepo.upsertProviderSyncState(db, seasonId, scope, payload);
}

function getLatestDashboardBriefing(seasonId, participantId) {
  return dashboardBriefingRepo.getLatestDashboardBriefing(db, seasonId, participantId);
}

function getDashboardBriefingHistory(seasonId, participantId, options) {
  return dashboardBriefingRepo.getDashboardBriefingHistory(db, seasonId, participantId, options);
}

function saveDashboardBriefing(seasonId, participantId, payload) {
  return dashboardBriefingRepo.saveDashboardBriefing(db, seasonId, participantId, payload);
}

module.exports = {
  db,
  DB_PATH,
  init,
  getActiveSeasonId,
  getActiveSeason,
  getSeason,
  getParticipantByToken,
  getSeasonParticipants,
  getSeasonSettings,
  updateSeasonSettings,
  getAuctionItems,
  getActiveAuctionItem,
  getRecentBids,
  getOwnership,
  getOwnershipBySeason,
  getTotalPotCents,
  getAuctionCounts,
  getResolvedAuctionStatus,
  getParticipantSpendCents,
  getParticipantReservedBidCents,
  getParticipantAuctionBudgetSummary,
  getStandings,
  getParticipantPortfolio,
  getEvents,
  getDrivers,
  getEventById,
  getEventResults,
  getEventPayoutRules,
  getSeasonBonusRules,
  getEventPayouts,
  getProviderSyncStates,
  upsertProviderSyncState,
  getDashboardBriefingHistory,
  getLatestDashboardBriefing,
  saveDashboardBriefing,
};
