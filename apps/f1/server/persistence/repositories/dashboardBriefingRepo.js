function getDashboardBriefingHistory(db, seasonId, participantId, { limit = 12 } = {}) {
  return db.prepare(`
    SELECT
      entry.id,
      entry.season_id,
      entry.participant_id,
      entry.event_id,
      entry.snapshot_hash,
      entry.briefing_phase,
      entry.briefing_title,
      entry.briefing_summary,
      entry.briefing_json,
      entry.source,
      entry.generated_at,
      entry.updated_at,
      event.name AS event_name,
      event.type AS event_type,
      event.starts_at AS event_starts_at
    FROM dashboard_briefing_entries entry
    LEFT JOIN events event ON event.id = entry.event_id
    WHERE entry.season_id = ? AND entry.participant_id = ?
    ORDER BY COALESCE(entry.generated_at, '') DESC, entry.updated_at DESC, entry.id DESC
    LIMIT ?
  `).all(seasonId, participantId, Number(limit) || 12);
}

function getLatestDashboardBriefing(db, seasonId, participantId) {
  return getDashboardBriefingHistory(db, seasonId, participantId, { limit: 1 })[0] || null;
}

function saveDashboardBriefing(db, seasonId, participantId, payload) {
  db.prepare(`
    INSERT INTO dashboard_briefing_entries
      (
        season_id,
        participant_id,
        event_id,
        snapshot_hash,
        briefing_phase,
        briefing_title,
        briefing_summary,
        briefing_json,
        source,
        generated_at,
        updated_at
      )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    seasonId,
    participantId,
    payload?.eventId || null,
    String(payload?.snapshotHash || ''),
    String(payload?.phase || 'unknown'),
    String(payload?.title || ''),
    String(payload?.summary || ''),
    JSON.stringify(payload?.content || null),
    String(payload?.source || 'unknown'),
    payload?.generatedAt || null,
    Number(payload?.updatedAt) || Date.now(),
  );

  return getLatestDashboardBriefing(db, seasonId, participantId);
}

module.exports = {
  getDashboardBriefingHistory,
  getLatestDashboardBriefing,
  saveDashboardBriefing,
};
