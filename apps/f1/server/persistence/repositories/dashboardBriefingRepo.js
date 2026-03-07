function getLatestDashboardBriefing(db, seasonId, participantId) {
  return db.prepare(`
    SELECT season_id, participant_id, event_id, snapshot_hash, briefing_text, source, generated_at, updated_at
    FROM dashboard_briefings
    WHERE season_id = ? AND participant_id = ?
  `).get(seasonId, participantId) || null;
}

function saveDashboardBriefing(db, seasonId, participantId, payload) {
  db.prepare(`
    INSERT INTO dashboard_briefings
      (season_id, participant_id, event_id, snapshot_hash, briefing_text, source, generated_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(season_id, participant_id) DO UPDATE SET
      event_id = excluded.event_id,
      snapshot_hash = excluded.snapshot_hash,
      briefing_text = excluded.briefing_text,
      source = excluded.source,
      generated_at = excluded.generated_at,
      updated_at = excluded.updated_at
  `).run(
    seasonId,
    participantId,
    payload?.eventId || null,
    String(payload?.snapshotHash || ''),
    String(payload?.text || ''),
    String(payload?.source || 'unknown'),
    payload?.generatedAt || null,
    Number(payload?.updatedAt) || Date.now(),
  );

  return getLatestDashboardBriefing(db, seasonId, participantId);
}

module.exports = {
  getLatestDashboardBriefing,
  saveDashboardBriefing,
};
