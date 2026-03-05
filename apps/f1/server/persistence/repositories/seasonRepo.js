function getActiveSeasonId(db) {
  const value = db.prepare("SELECT value FROM settings WHERE key = 'active_season_id'").get()?.value;
  if (value) return parseInt(value, 10);
  const season = db.prepare('SELECT id FROM seasons ORDER BY id ASC LIMIT 1').get();
  return season?.id || 1;
}

function getActiveSeason(db) {
  return getSeason(db, getActiveSeasonId(db));
}

function getSeason(db, id) {
  return db.prepare('SELECT * FROM seasons WHERE id = ?').get(id);
}

function getParticipantByToken(db, token) {
  return db.prepare('SELECT * FROM participants WHERE session_token = ?').get(token);
}

function getSeasonParticipants(db, seasonId) {
  return db.prepare(`
    SELECT p.id, p.name, p.color, p.is_admin
    FROM participants p
    JOIN season_participants sp ON sp.participant_id = p.id
    WHERE sp.season_id = ?
    ORDER BY sp.joined_at ASC
  `).all(seasonId);
}

function getSeasonSettings(db, seasonId) {
  return db.prepare(`
    SELECT id, year, name, invite_code, status,
           auction_timer_seconds, auction_grace_seconds,
           auction_status, auction_auto_advance,
           payout_model_version,
           season_random_bonus_position,
           season_random_bonus_drawn_at
    FROM seasons
    WHERE id = ?
  `).get(seasonId);
}

function updateSeasonSettings(db, seasonId, patch) {
  const allowed = [
    'name',
    'invite_code',
    'auction_timer_seconds',
    'auction_grace_seconds',
    'auction_status',
    'auction_auto_advance',
    'status',
  ];

  const entries = Object.entries(patch || {}).filter(([k]) => allowed.includes(k));
  if (!entries.length) return;

  const sets = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = entries.map(([, v]) => v);
  db.prepare(`UPDATE seasons SET ${sets} WHERE id = ?`).run(...values, seasonId);
}

function getDrivers(db, seasonId) {
  return db.prepare(`
    SELECT id, external_id, code, name, team_name, active
    FROM drivers
    WHERE season_id = ? AND active = 1
    ORDER BY external_id ASC, id ASC
  `).all(seasonId);
}

module.exports = {
  getActiveSeasonId,
  getActiveSeason,
  getSeason,
  getParticipantByToken,
  getSeasonParticipants,
  getSeasonSettings,
  updateSeasonSettings,
  getDrivers,
};
