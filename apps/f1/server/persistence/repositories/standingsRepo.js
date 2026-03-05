function getStandings(db, seasonId) {
  return db.prepare(`
    SELECT
      p.id,
      p.name,
      p.color,
      COALESCE(o_agg.drivers_owned, 0) as drivers_owned,
      COALESCE(o_agg.total_spent_cents, 0) as total_spent_cents,
      COALESCE(e_agg.total_event_cents, 0) + COALESCE(sb_agg.total_bonus_cents, 0) as total_earned_cents
    FROM participants p
    JOIN season_participants sp ON sp.participant_id = p.id AND sp.season_id = ?
    LEFT JOIN (
      SELECT participant_id,
             COUNT(*) as drivers_owned,
             SUM(purchase_price_cents) as total_spent_cents
      FROM ownership
      WHERE season_id = ?
      GROUP BY participant_id
    ) o_agg ON o_agg.participant_id = p.id
    LEFT JOIN (
      SELECT participant_id, SUM(amount_cents) as total_event_cents
      FROM event_payouts
      WHERE season_id = ?
      GROUP BY participant_id
    ) e_agg ON e_agg.participant_id = p.id
    LEFT JOIN (
      SELECT participant_id, SUM(amount_cents) as total_bonus_cents
      FROM season_bonus_payouts
      WHERE season_id = ?
      GROUP BY participant_id
    ) sb_agg ON sb_agg.participant_id = p.id
    WHERE p.is_admin = 0
    ORDER BY total_earned_cents DESC, total_spent_cents ASC, p.name ASC
  `).all(seasonId, seasonId, seasonId, seasonId);
}

function getParticipantPortfolio(db, seasonId, participantId) {
  return db.prepare(`
    SELECT o.purchase_price_cents,
           d.id as driver_id,
           d.external_id as driver_external_id,
           d.code as driver_code,
           d.name as driver_name,
           d.team_name,
           COALESCE(ep.event_earnings_cents, 0) as event_earnings_cents,
           COALESCE(sb.bonus_earnings_cents, 0) as bonus_earnings_cents
    FROM ownership o
    JOIN drivers d ON d.id = o.driver_id
    LEFT JOIN (
      SELECT driver_id, participant_id, SUM(amount_cents) as event_earnings_cents
      FROM event_payouts
      WHERE season_id = ?
      GROUP BY driver_id, participant_id
    ) ep ON ep.driver_id = o.driver_id AND ep.participant_id = o.participant_id
    LEFT JOIN (
      SELECT driver_id, participant_id, SUM(amount_cents) as bonus_earnings_cents
      FROM season_bonus_payouts
      WHERE season_id = ?
      GROUP BY driver_id, participant_id
    ) sb ON sb.driver_id = o.driver_id AND sb.participant_id = o.participant_id
    WHERE o.season_id = ? AND o.participant_id = ?
    ORDER BY d.name ASC
  `).all(seasonId, seasonId, seasonId, participantId);
}

module.exports = {
  getStandings,
  getParticipantPortfolio,
};
