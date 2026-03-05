const {
  db,
  getDrivers,
  getEventById,
  getEventResults,
} = require('../../db');
const {
  scoreEvent,
  recalcSeasonBonuses,
  upsertEventResults,
  syncEventFromProvider,
  syncNextEventFromProvider,
} = require('../scoringService');

function syncNextResults({ seasonId, provider, io, force = false }) {
  return syncNextEventFromProvider({
    seasonId,
    provider,
    io,
    includeFuture: force,
    ignoreLock: force,
  });
}

function syncEventResults({ seasonId, eventId, provider, io, force = false }) {
  return syncEventFromProvider({
    seasonId,
    eventId,
    provider,
    io,
    ignoreLock: force,
  });
}

function getEventEditorData({ seasonId, eventId }) {
  const event = getEventById(seasonId, eventId);
  if (!event) return { ok: false, status: 404, error: 'Event not found' };

  return {
    ok: true,
    event,
    drivers: getDrivers(seasonId),
    results: getEventResults(eventId),
  };
}

function saveManualResultsAndScore({ seasonId, eventId, rows, force = false }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, status: 400, error: 'results must be a non-empty array' };
  }

  const upsertResult = upsertEventResults({
    seasonId,
    eventId,
    rows,
    manualOverride: true,
  });

  if (!upsertResult.ok) {
    return { ok: false, status: upsertResult.status || 400, error: upsertResult.error };
  }

  const scoreResult = scoreEvent({ seasonId, eventId, ignoreLock: force });
  if (!scoreResult.ok) {
    return { ok: false, status: scoreResult.status || 400, error: scoreResult.error };
  }

  return { ok: true, rowCount: upsertResult.rowCount };
}

function recalcSeasonBonusesForSeason({ seasonId, io }) {
  const result = recalcSeasonBonuses({ seasonId });
  io?.emit('standings:update');
  return { ok: true, ...result };
}

function getSeasonBonusPayouts({ seasonId }) {
  const rows = db.prepare(`
    SELECT sbp.id, sbp.category, sbp.amount_cents, sbp.tie_count,
           p.name as participant_name,
           d.code as driver_code,
           d.name as driver_name
    FROM season_bonus_payouts sbp
    JOIN participants p ON p.id = sbp.participant_id
    LEFT JOIN drivers d ON d.id = sbp.driver_id
    WHERE sbp.season_id = ?
    ORDER BY sbp.category ASC, sbp.amount_cents DESC, p.name ASC
  `).all(seasonId);

  const totals = db.prepare(`
    SELECT category, SUM(amount_cents) as total_cents
    FROM season_bonus_payouts
    WHERE season_id = ?
    GROUP BY category
    ORDER BY category ASC
  `).all(seasonId);

  return { rows, totals };
}

module.exports = {
  syncNextResults,
  syncEventResults,
  getEventEditorData,
  saveManualResultsAndScore,
  recalcSeasonBonusesForSeason,
  getSeasonBonusPayouts,
};
