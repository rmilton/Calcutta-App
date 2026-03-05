const {
  amountFromBps,
  splitCentsEvenly,
} = require('../lib/core');
const {
  db,
  getTotalPotCents,
  getEventById,
  getEventResults,
  getEventPayoutRules,
  getSeasonBonusRules,
  getOwnershipBySeason,
} = require('../db');

const GP_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];

function valueForPosition(pointsTable, pos) {
  if (!pos || pos < 1 || pos > pointsTable.length) return 0;
  return pointsTable[pos - 1] || 0;
}

function winnersByFinish(rows, targetPosition) {
  return rows.filter((r) => r.finish_position === targetPosition).map((r) => r.driver_id);
}

function bestFinisherAtOrBelow(rows, floorPosition) {
  const eligible = rows.filter((r) => r.finish_position >= floorPosition);
  if (!eligible.length) return [];
  const best = Math.min(...eligible.map((r) => r.finish_position));
  return eligible.filter((r) => r.finish_position === best).map((r) => r.driver_id);
}

function mostPositionsGained(rows, denseRank) {
  if (!rows.length) return [];
  const values = [...new Set(rows.map((r) => r.positions_gained || 0))].sort((a, b) => b - a);
  const target = values[denseRank - 1];
  if (target == null) return [];
  return rows
    .filter((r) => (r.positions_gained || 0) === target)
    .map((r) => r.driver_id);
}

function randomPositionWinners(rows, randomPosition) {
  if (!randomPosition) return [];
  return rows.filter((r) => r.finish_position === randomPosition).map((r) => r.driver_id);
}

function resolveCategoryWinners(category, rows, event, rankOrder = 1) {
  switch (category) {
    case 'race_winner':
    case 'sprint_winner':
      return winnersByFinish(rows, 1);
    case 'second_place':
      return winnersByFinish(rows, 2);
    case 'third_place':
      return winnersByFinish(rows, 3);
    case 'best_p6_or_lower':
      return bestFinisherAtOrBelow(rows, 6);
    case 'best_p11_or_lower':
      return bestFinisherAtOrBelow(rows, 11);
    case 'most_positions_gained':
      return mostPositionsGained(rows, 1);
    case 'second_most_positions_gained':
      return mostPositionsGained(rows, rankOrder || 2);
    case 'random_finish_bonus':
      return randomPositionWinners(rows, event.random_bonus_position);
    default:
      return [];
  }
}

function ensureRandomBonusPosition(event) {
  const minPosition = event.type === 'grand_prix' ? 4 : 1;
  const maxPosition = 20;
  const existing = Number(event.random_bonus_position);
  if (existing >= minPosition && existing <= maxPosition) return existing;

  const drawn = Math.floor(Math.random() * (maxPosition - minPosition + 1)) + minPosition;
  db.prepare(`
    UPDATE events
    SET random_bonus_position = ?, random_bonus_drawn_at = ?
    WHERE id = ?
  `).run(drawn, Date.now(), event.id);
  return drawn;
}

function scoreEvent({ seasonId, eventId, skipSeasonBonuses = false, ignoreLock = false }) {
  const event = getEventById(seasonId, eventId);
  if (!event) return { ok: false, status: 404, error: 'Event not found' };

  const lockAtMs = event.lock_at ? Date.parse(event.lock_at) : null;
  if (!ignoreLock && Number.isFinite(lockAtMs) && Date.now() < lockAtMs) {
    return { ok: false, status: 400, error: 'Event lock time has not passed yet' };
  }

  const rows = getEventResults(eventId);
  if (!rows.length) return { ok: false, status: 400, error: 'No event results to score' };

  ensureRandomBonusPosition(event);
  const updatedEvent = getEventById(seasonId, eventId);

  const rules = getEventPayoutRules(seasonId, updatedEvent.type);
  const ownershipMap = new Map(getOwnershipBySeason(seasonId).map((o) => [o.driver_id, o.participant_id]));
  const totalPotCents = getTotalPotCents(seasonId);

  db.transaction(() => {
    db.prepare('DELETE FROM event_payouts WHERE season_id = ? AND event_id = ?').run(seasonId, eventId);

    const insertPayout = db.prepare(`
      INSERT INTO event_payouts
        (season_id, event_id, participant_id, driver_id, category, amount_cents, tie_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const rule of rules) {
      const categoryAmountCents = amountFromBps(totalPotCents, rule.bps);
      if (categoryAmountCents <= 0) continue;

      const winnerDriverIds = resolveCategoryWinners(rule.category, rows, updatedEvent, rule.rank_order);
      if (!winnerDriverIds.length) continue;

      const shares = splitCentsEvenly(categoryAmountCents, winnerDriverIds.length);
      winnerDriverIds.forEach((driverId, idx) => {
        const participantId = ownershipMap.get(driverId);
        if (!participantId) return;
        insertPayout.run(
          seasonId,
          eventId,
          participantId,
          driverId,
          rule.category,
          shares[idx],
          winnerDriverIds.length
        );
      });
    }

    db.prepare(`
      UPDATE events
      SET status = 'scored', synced_at = ?, random_bonus_position = COALESCE(random_bonus_position, ?)
      WHERE id = ?
    `).run(Date.now(), updatedEvent.random_bonus_position, eventId);
  })();

  if (!skipSeasonBonuses) {
    recalcSeasonBonuses({ seasonId });
  }

  return { ok: true };
}

function getAllSeasonResultRows(seasonId) {
  return db.prepare(`
    SELECT e.id as event_id, e.type, er.driver_id, er.finish_position, er.positions_gained
    FROM event_results er
    JOIN events e ON e.id = er.event_id
    WHERE e.season_id = ? AND e.status = 'scored'
  `).all(seasonId);
}

function getChampionshipStandings(seasonId, rows) {
  const points = new Map(
    db.prepare('SELECT id FROM drivers WHERE season_id = ? ORDER BY id ASC').all(seasonId)
      .map((driver) => [driver.id, 0])
  );

  for (const row of rows) {
    const table = row.type === 'sprint' ? SPRINT_POINTS : GP_POINTS;
    const earned = valueForPosition(table, row.finish_position);
    points.set(row.driver_id, (points.get(row.driver_id) || 0) + earned);
  }

  return Array.from(points.entries())
    .map(([driver_id, total_points]) => ({ driver_id, total_points }))
    .sort((a, b) => (b.total_points - a.total_points) || (a.driver_id - b.driver_id));
}

function getWinnersFromMetric(metricMap, comparator) {
  const entries = Array.from(metricMap.entries());
  if (!entries.length) return [];
  let targetValue = entries[0][1];
  entries.forEach(([, value]) => {
    if (comparator(value, targetValue)) targetValue = value;
  });
  return entries.filter(([, value]) => value === targetValue).map(([driverId]) => driverId);
}

function getSeasonRandomBonusPosition(seasonId, standingsCount) {
  if (standingsCount <= 0) return null;
  const season = db.prepare(`
    SELECT season_random_bonus_position
    FROM seasons
    WHERE id = ?
  `).get(seasonId);

  const existing = Number(season?.season_random_bonus_position);
  if (existing >= 1 && existing <= standingsCount) {
    return existing;
  }

  const drawn = Math.floor(Math.random() * standingsCount) + 1;
  db.prepare(`
    UPDATE seasons
    SET season_random_bonus_position = ?, season_random_bonus_drawn_at = ?
    WHERE id = ?
  `).run(drawn, Date.now(), seasonId);
  return drawn;
}

function resolveSeasonBonusWinners(category, seasonId, context) {
  const { rows, standings } = context;

  if (category === 'drivers_champion') {
    return standings.length ? [standings[0].driver_id] : [];
  }

  if (category === 'most_race_wins') {
    const wins = new Map();
    rows
      .filter((row) => row.type === 'grand_prix' && row.finish_position === 1)
      .forEach((row) => wins.set(row.driver_id, (wins.get(row.driver_id) || 0) + 1));
    return getWinnersFromMetric(wins, (a, b) => a > b);
  }

  if (category === 'most_top10_outside_top4') {
    const topFour = new Set(standings.slice(0, 4).map((entry) => entry.driver_id));
    const top10Counts = new Map();

    rows
      .filter((row) => row.finish_position <= 10 && !topFour.has(row.driver_id))
      .forEach((row) => top10Counts.set(row.driver_id, (top10Counts.get(row.driver_id) || 0) + 1));

    return getWinnersFromMetric(top10Counts, (a, b) => a > b);
  }

  if (category === 'season_random_finish_position') {
    const drawnPosition = getSeasonRandomBonusPosition(seasonId, standings.length);
    if (!drawnPosition) return [];
    const winner = standings[drawnPosition - 1];
    return winner ? [winner.driver_id] : [];
  }

  if (category === 'biggest_single_race_climb') {
    if (!rows.length) return [];
    const bestGain = Math.max(...rows.map((row) => Number(row.positions_gained) || 0));
    return [...new Set(
      rows
        .filter((row) => (Number(row.positions_gained) || 0) === bestGain)
        .map((row) => row.driver_id)
    )];
  }

  return [];
}

function recalcSeasonBonuses({ seasonId }) {
  const rules = getSeasonBonusRules(seasonId);

  db.prepare('DELETE FROM season_bonus_payouts WHERE season_id = ?').run(seasonId);
  if (!rules.length) return { ok: true, distributedCents: 0 };

  const totalPot = getTotalPotCents(seasonId);
  if (totalPot <= 0) return { ok: true, distributedCents: 0 };

  const rows = getAllSeasonResultRows(seasonId);
  const standings = getChampionshipStandings(seasonId, rows);
  const ownershipMap = new Map(getOwnershipBySeason(seasonId).map((o) => [o.driver_id, o.participant_id]));

  const insert = db.prepare(`
    INSERT INTO season_bonus_payouts
      (season_id, participant_id, driver_id, category, amount_cents, tie_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let distributed = 0;
  rules.forEach((rule) => {
    const payoutCents = amountFromBps(totalPot, rule.bps);
    const winners = resolveSeasonBonusWinners(rule.category, seasonId, { rows, standings });
    if (!winners.length || payoutCents <= 0) return;

    const shares = splitCentsEvenly(payoutCents, winners.length);
    winners.forEach((driverId, shareIdx) => {
      const participantId = ownershipMap.get(driverId);
      if (!participantId) return;
      distributed += shares[shareIdx];
      insert.run(seasonId, participantId, driverId, rule.category, shares[shareIdx], winners.length);
    });
  });

  return { ok: true, distributedCents: distributed };
}

function rescoreSeasonEvents({ seasonId }) {
  const eventIds = db.prepare(`
    SELECT e.id
    FROM events e
    WHERE e.season_id = ?
      AND EXISTS (
        SELECT 1 FROM event_results er WHERE er.event_id = e.id
      )
    ORDER BY e.round_number ASC,
      CASE WHEN e.type = 'sprint' THEN 0 ELSE 1 END ASC
  `).all(seasonId).map((row) => row.id);

  db.prepare('DELETE FROM event_payouts WHERE season_id = ?').run(seasonId);

  let rescoredEvents = 0;
  for (const eventId of eventIds) {
    const result = scoreEvent({
      seasonId,
      eventId,
      skipSeasonBonuses: true,
      ignoreLock: true,
    });
    if (!result.ok) {
      return result;
    }
    rescoredEvents += 1;
  }

  const seasonBonus = recalcSeasonBonuses({ seasonId });
  return {
    ok: true,
    rescoredEvents,
    seasonBonusDistributedCents: seasonBonus.distributedCents || 0,
  };
}

function upsertEventResults({ seasonId, eventId, rows, manualOverride = false }) {
  const event = getEventById(seasonId, eventId);
  if (!event) return { ok: false, status: 404, error: 'Event not found' };

  const driversByExternal = new Map(
    db.prepare('SELECT id, external_id FROM drivers WHERE season_id = ?').all(seasonId)
      .map((driver) => [driver.external_id, driver.id])
  );

  const parsedRows = (rows || []).map((row) => {
    const driverId = row.driver_id || driversByExternal.get(row.external_driver_id);
    if (!driverId) return null;
    const finish = Number(row.finish_position);
    const start = Number(row.start_position);
    if (!Number.isFinite(finish) || finish < 1) return null;
    const startPos = Number.isFinite(start) && start >= 1 ? start : null;

    return {
      driver_id: driverId,
      finish_position: Math.floor(finish),
      start_position: startPos,
      positions_gained: startPos ? (startPos - Math.floor(finish)) : 0,
      is_manual_override: manualOverride ? 1 : 0,
    };
  }).filter(Boolean);

  if (!parsedRows.length) {
    return { ok: false, status: 400, error: 'No valid result rows provided' };
  }

  const insert = db.prepare(`
    INSERT INTO event_results
      (event_id, driver_id, finish_position, start_position, positions_gained, is_manual_override, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    db.prepare('DELETE FROM event_results WHERE event_id = ?').run(eventId);

    parsedRows.forEach((row) => {
      insert.run(
        eventId,
        row.driver_id,
        row.finish_position,
        row.start_position,
        row.positions_gained,
        row.is_manual_override,
        Date.now()
      );
    });

    db.prepare(`
      UPDATE events
      SET status = 'results_loaded', synced_at = ?
      WHERE id = ?
    `).run(Date.now(), eventId);
  })();

  return { ok: true, rowCount: parsedRows.length };
}

function syncEventFromProvider({ seasonId, eventId, provider, io, ignoreLock = false }) {
  const event = getEventById(seasonId, eventId);
  if (!event) return { ok: false, status: 404, error: 'Event not found' };

  const drivers = db.prepare('SELECT external_id FROM drivers WHERE season_id = ?').all(seasonId);

  return Promise.resolve()
    .then(async () => {
      io?.emit('results:sync:started', { eventId, roundNumber: event.round_number, name: event.name });
      const rows = await provider.fetchEventResults({ event, drivers });
      const upsert = upsertEventResults({ seasonId, eventId, rows, manualOverride: false });
      if (!upsert.ok) return upsert;
      const scored = scoreEvent({ seasonId, eventId, ignoreLock });
      if (!scored.ok) return scored;
      io?.emit('event:scored', { eventId, roundNumber: event.round_number, name: event.name });
      io?.emit('standings:update');
      io?.emit('results:sync:done', { eventId, ok: true, rowCount: upsert.rowCount });
      return { ok: true, rowCount: upsert.rowCount };
    })
    .catch((error) => {
      io?.emit('results:sync:done', { eventId, ok: false, error: error.message || String(error) });
      return { ok: false, status: 500, error: error.message || 'Sync failed' };
    });
}

async function syncNextEventFromProvider({
  seasonId,
  provider,
  io,
  includeFuture = false,
  ignoreLock = false,
}) {
  const query = includeFuture
    ? `
      SELECT *
      FROM events
      WHERE season_id = ?
        AND (status = 'pending' OR status = 'results_loaded')
      ORDER BY round_number ASC,
        CASE WHEN type = 'sprint' THEN 0 ELSE 1 END ASC
      LIMIT 1
    `
    : `
      SELECT *
      FROM events
      WHERE season_id = ?
        AND (status = 'pending' OR status = 'results_loaded')
        AND (starts_at IS NULL OR starts_at <= ?)
      ORDER BY round_number ASC,
        CASE WHEN type = 'sprint' THEN 0 ELSE 1 END ASC
      LIMIT 1
    `;

  const event = includeFuture
    ? db.prepare(query).get(seasonId)
    : db.prepare(query).get(seasonId, new Date().toISOString());

  if (!event) return { ok: false, status: 404, error: 'No events pending sync' };
  return syncEventFromProvider({ seasonId, eventId: event.id, provider, io, ignoreLock });
}

module.exports = {
  scoreEvent,
  recalcSeasonBonuses,
  rescoreSeasonEvents,
  upsertEventResults,
  syncEventFromProvider,
  syncNextEventFromProvider,
};
