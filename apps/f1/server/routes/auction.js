const express = require('express');
const {
  getActiveSeasonId,
  getAuctionItems,
  getActiveAuctionItem,
  getRecentBids,
  getResolvedAuctionStatus,
} = require('../db');
const { requireAuth } = require('./middleware');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const seasonId = getActiveSeasonId();
  const active = getActiveAuctionItem(seasonId);
  res.json({
    auctionStatus: getResolvedAuctionStatus(seasonId),
    active,
    recentBids: active ? getRecentBids(active.driver_id, seasonId) : [],
    items: getAuctionItems(seasonId),
  });
});

router.get('/items', requireAuth, (req, res) => {
  res.json(getAuctionItems(getActiveSeasonId()));
});

module.exports = router;
