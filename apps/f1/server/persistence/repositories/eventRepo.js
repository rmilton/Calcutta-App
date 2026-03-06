const EVENT_CATEGORY_ORDER = {
  grand_prix: [
    'race_winner',
    'second_place',
    'third_place',
    'best_p6_or_lower',
    'best_p11_or_lower',
    'most_positions_gained',
    'slowest_pit_stop',
    'random_finish_bonus',
  ],
  sprint: [
    'sprint_winner',
    'best_p6_or_lower',
    'most_positions_gained',
    'random_finish_bonus',
  ],
};

function categorySortIndex(eventType, category) {
  const order = EVENT_CATEGORY_ORDER[eventType] || [];
  const index = order.indexOf(category);
  return index === -1 ? 999 : index;
}

function getEvents(db, seasonId) {
  return db.prepare(`
    SELECT e.*,
           COALESCE(p.total_payout_cents, 0) as total_payout_cents,
           COALESCE(r.result_count, 0) as result_count
    FROM events e
    LEFT JOIN (
      SELECT event_id, SUM(amount_cents) as total_payout_cents
      FROM event_payouts
      WHERE season_id = ?
      GROUP BY event_id
    ) p ON p.event_id = e.id
    LEFT JOIN (
      SELECT event_id, COUNT(*) as result_count
      FROM event_results
      GROUP BY event_id
    ) r ON r.event_id = e.id
    WHERE e.season_id = ?
    ORDER BY e.round_number ASC,
      CASE WHEN e.type = 'sprint' THEN 0 ELSE 1 END ASC
  `).all(seasonId, seasonId);
}

function getEventById(db, seasonId, eventId) {
  return db.prepare('SELECT * FROM events WHERE season_id = ? AND id = ?').get(seasonId, eventId);
}

function getEventResults(db, eventId) {
  return db.prepare(`
    SELECT er.*, d.external_id as driver_external_id, d.code as driver_code,
           d.name as driver_name, d.team_name, d.active as driver_active
    FROM event_results er
    JOIN drivers d ON d.id = er.driver_id
    WHERE er.event_id = ?
    ORDER BY er.finish_position ASC
  `).all(eventId);
}

function getEventPayoutRules(db, seasonId, eventType) {
  const rows = db.prepare(`
    SELECT *
    FROM event_payout_rules
    WHERE season_id = ? AND event_type = ? AND active = 1
  `).all(seasonId, eventType);

  return rows.sort((a, b) => (
    (categorySortIndex(eventType, a.category) - categorySortIndex(eventType, b.category))
    || (Number(a.rank_order || 1) - Number(b.rank_order || 1))
    || (a.category || '').localeCompare(b.category || '')
  ));
}

function getSeasonBonusRules(db, seasonId) {
  return db.prepare(`
    SELECT *
    FROM season_bonus_rules
    WHERE season_id = ? AND active = 1
    ORDER BY rank_order ASC, category ASC
  `).all(seasonId);
}

function getEventPayouts(db, seasonId, eventId) {
  const rows = db.prepare(`
    SELECT ep.*, p.name as participant_name, p.color as participant_color,
           d.code as driver_code, d.name as driver_name
    FROM event_payouts ep
    JOIN participants p ON p.id = ep.participant_id
    LEFT JOIN drivers d ON d.id = ep.driver_id
    WHERE ep.season_id = ? AND ep.event_id = ?
  `).all(seasonId, eventId);

  const eventType = getEventById(db, seasonId, eventId)?.type || null;

  return rows.sort((a, b) => (
    (categorySortIndex(eventType, a.category) - categorySortIndex(eventType, b.category))
    || ((Number(b.amount_cents) || 0) - (Number(a.amount_cents) || 0))
    || (a.participant_name || '').localeCompare(b.participant_name || '')
  ));
}

module.exports = {
  getEvents,
  getEventById,
  getEventResults,
  getEventPayoutRules,
  getSeasonBonusRules,
  getEventPayouts,
  categorySortIndex,
};
