const express = require('express');
const {
  getActiveSeasonId,
  getSeasonSettings,
  getAuctionItems,
  getActiveAuctionItem,
  getRecentBids,
  getResolvedAuctionStatus,
  getParticipantAuctionBudgetSummary,
} = require('../db');
const { requireAuth } = require('./middleware');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const seasonId = getActiveSeasonId();
  const active = getActiveAuctionItem(seasonId);
  const settings = getSeasonSettings(seasonId);
  const budgetSummary = req.participant && !req.participant.is_admin
    ? getParticipantAuctionBudgetSummary(seasonId, req.participant.id, settings.auction_budget_cap_cents)
    : {
      auctionBudgetCapCents: Number(settings?.auction_budget_cap_cents || 0),
      participantSpentCents: 0,
      participantReservedBidCents: 0,
      participantRemainingCents: Number(settings?.auction_budget_cap_cents || 0),
    };
  res.json({
    auctionStatus: getResolvedAuctionStatus(seasonId),
    active,
    recentBids: active ? getRecentBids(active.driver_id, seasonId) : [],
    items: getAuctionItems(seasonId),
    ...budgetSummary,
  });
});

router.get('/items', requireAuth, (req, res) => {
  res.json(getAuctionItems(getActiveSeasonId()));
});

module.exports = router;
