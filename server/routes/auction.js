const express = require('express');
const {
  getActiveTournamentId,
  getAuctionItems, getActiveAuctionItem, getRecentBids, getTournamentSetting,
} = require('../db');
const { requireAuth } = require('./middleware');

const router = express.Router();

function resolveTid(req) {
  return req.query.t ? parseInt(req.query.t) : getActiveTournamentId();
}

// GET /api/auction  - full auction state
router.get('/', requireAuth, (req, res) => {
  const tid = resolveTid(req);
  const activeTid = getActiveTournamentId();
  const items = getAuctionItems(tid);
  const active = getActiveAuctionItem(tid);
  const recentBids = active ? getRecentBids(active.team_id) : [];
  res.json({
    auctionStatus: getTournamentSetting(tid, 'auction_status'),
    items,
    active,
    recentBids,
    tournamentId: tid,
    isActive: tid === activeTid,
  });
});

// GET /api/auction/items  - all items with status
router.get('/items', requireAuth, (req, res) => {
  const tid = resolveTid(req);
  res.json(getAuctionItems(tid));
});

module.exports = router;
