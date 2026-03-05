function getProviderSyncStates(db, seasonId) {
  return db.prepare(`
    SELECT season_id, scope, provider, status, message, meta_json, updated_at
    FROM provider_sync_state
    WHERE season_id = ?
    ORDER BY scope ASC
  `).all(seasonId);
}

function upsertProviderSyncState(db, seasonId, scope, payload) {
  const metaJson = payload?.meta ? JSON.stringify(payload.meta) : null;
  db.prepare(`
    INSERT INTO provider_sync_state
      (season_id, scope, provider, status, message, meta_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(season_id, scope) DO UPDATE SET
      provider = excluded.provider,
      status = excluded.status,
      message = excluded.message,
      meta_json = excluded.meta_json,
      updated_at = excluded.updated_at
  `).run(
    seasonId,
    scope,
    String(payload?.provider || 'unknown'),
    String(payload?.status || 'unknown'),
    payload?.message || null,
    metaJson,
    Number(payload?.updated_at) || Date.now(),
  );
}

module.exports = {
  getProviderSyncStates,
  upsertProviderSyncState,
};
