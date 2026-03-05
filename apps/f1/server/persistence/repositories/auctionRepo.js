function getAuctionItems(db, seasonId) {
  return db.prepare(`
    SELECT ai.*, d.external_id as driver_external_id, d.code as driver_code,
           d.name as driver_name, d.team_name,
           p.name as leader_name, p.color as leader_color,
           w.name as winner_name, w.color as winner_color
    FROM auction_items ai
    JOIN drivers d ON d.id = ai.driver_id
    LEFT JOIN participants p ON p.id = ai.current_leader_id
    LEFT JOIN participants w ON w.id = ai.winner_id
    WHERE ai.season_id = ?
    ORDER BY ai.queue_order ASC
  `).all(seasonId);
}

function getActiveAuctionItem(db, seasonId) {
  return db.prepare(`
    SELECT ai.*, d.external_id as driver_external_id, d.code as driver_code,
           d.name as driver_name, d.team_name,
           p.name as leader_name, p.color as leader_color
    FROM auction_items ai
    JOIN drivers d ON d.id = ai.driver_id
    LEFT JOIN participants p ON p.id = ai.current_leader_id
    WHERE ai.season_id = ? AND ai.status = 'active'
    LIMIT 1
  `).get(seasonId);
}

function getRecentBids(db, driverId, seasonId, limit = 10) {
  return db.prepare(`
    SELECT b.*, p.name as participant_name, p.color
    FROM bids b
    JOIN participants p ON p.id = b.participant_id
    WHERE b.driver_id = ? AND b.season_id = ?
    ORDER BY b.created_at DESC, b.id DESC
    LIMIT ?
  `).all(driverId, seasonId, limit);
}

function getOwnership(db, seasonId) {
  return db.prepare(`
    SELECT o.*, d.code as driver_code, d.name as driver_name, d.team_name,
           p.name as owner_name, p.color as owner_color
    FROM ownership o
    JOIN drivers d ON d.id = o.driver_id
    JOIN participants p ON p.id = o.participant_id
    WHERE o.season_id = ?
    ORDER BY p.name ASC, d.name ASC
  `).all(seasonId);
}

function getOwnershipBySeason(db, seasonId) {
  return db.prepare(`
    SELECT driver_id, participant_id
    FROM ownership
    WHERE season_id = ?
  `).all(seasonId);
}

function getTotalPotCents(db, seasonId) {
  return db.prepare(`
    SELECT COALESCE(SUM(purchase_price_cents), 0) as total
    FROM ownership
    WHERE season_id = ?
  `).get(seasonId).total;
}

function getAuctionCounts(db, seasonId) {
  return db.prepare(`
    SELECT
      COUNT(*) as total_count,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
      SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as sold_count
    FROM auction_items
    WHERE season_id = ?
  `).get(seasonId);
}

function getResolvedAuctionStatus(db, seasonId) {
  const configured = db.prepare('SELECT auction_status FROM seasons WHERE id = ?').get(seasonId)?.auction_status || 'waiting';
  const counts = getAuctionCounts(db, seasonId);
  if (
    counts.total_count > 0
    && counts.sold_count === counts.total_count
    && counts.pending_count === 0
    && counts.active_count === 0
  ) {
    return 'complete';
  }
  return configured;
}

module.exports = {
  getAuctionItems,
  getActiveAuctionItem,
  getRecentBids,
  getOwnership,
  getOwnershipBySeason,
  getTotalPotCents,
  getAuctionCounts,
  getResolvedAuctionStatus,
};
