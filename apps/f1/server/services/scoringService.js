const {
  amountFromBps,
  allocateByBps,
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

function keyByDriver(rows) {
  const map = new Map();
  for (const row of rows) {
    map.set(row.driver_id, row);
  }
  return map;
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
  if (event.random_bonus_position) return event.random_bonus_position;
  const drawn = (Math.floor(Math.random() * 20) + 1);
  db.prepare(`
    UPDATE events
    SET random_bonus_position = ?, random_bonus_drawn_at = ?
    WHERE id = ?
  `).run(drawn, Date.now(), event.id);
  return drawn;
}

function scoreEvent({ seasonId, eventId, skipSeasonBonuses = false }) {
  const event = getEventById(seasonId, eventId);
  if (!event) return { ok: false, status: 404, error: 'Event not found' };

  const lockAtMs = event.lock_at ? Date.parse(event.lock_at) : null;
  if (Number.isFinite(lockAtMs) && Date.now() < lockAtMs) {
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
    SELECT e.type, er.driver_id, er.finish_position
    FROM event_results er
    JOIN events e ON e.id = er.event_id
    WHERE e.season_id = ?
  `).all(seasonId);
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

function resolveSeasonBonusWinners(category, seasonId) {
  const rows = getAllSeasonResultRows(seasonId);
  if (!rows.length) return [];

  if (category === 'drivers_champion') {
    const points = new Map();
    for (const row of rows) {
      const table = row.type === 'sprint' ? SPRINT_POINTS : GP_POINTS;
      const earned = valueForPosition(table, row.finish_position);
      points.set(row.driver_id, (points.get(row.driver_id) || 0) + earned);
    }
    return getWinnersFromMetric(points, (a, b) => a > b);
  }

  if (category === 'most_race_wins') {
    const wins = new Map();
    rows
      .filter((row) => row.type === 'grand_prix' && row.finish_position === 1)
      .forEach((row) => wins.set(row.driver_id, (wins.get(row.driver_id) || 0) + 1));
    return getWinnersFromMetric(wins, (a, b) => a > b);
  }

  if (category === 'most_podiums') {
    const podiums = new Map();
    rows
      .filter((row) => row.type === 'grand_prix' && row.finish_position <= 3)
      .forEach((row) => podiums.set(row.driver_id, (podiums.get(row.driver_id) || 0) + 1));
    return getWinnersFromMetric(podiums, (a, b) => a > b);
  }

  if (category === 'best_avg_finish') {
    const sums = new Map();
    const counts = new Map();

    rows
      .filter((row) => row.type === 'grand_prix')
      .forEach((row) => {
        sums.set(row.driver_id, (sums.get(row.driver_id) || 0) + row.finish_position);
        counts.set(row.driver_id, (counts.get(row.driver_id) || 0) + 1);
      });

    const averages = new Map();
    for (const [driverId, count] of counts.entries()) {
      if (count > 0) {
        averages.set(driverId, Math.round((sums.get(driverId) / count) * 1000) / 1000);
      }
    }
    return getWinnersFromMetric(averages, (a, b) => a < b);
  }

  return [];
}

function recalcSeasonBonuses({ seasonId }) {
  const rules = getSeasonBonusRules(seasonId);

  db.prepare('DELETE FROM season_bonus_payouts WHERE season_id = ?').run(seasonId);
  if (!rules.length) return { ok: true, distributedCents: 0 };

  const totalPot = getTotalPotCents(seasonId);
  const eventDistributed = db.prepare(
    'SELECT COALESCE(SUM(amount_cents), 0) as total FROM event_payouts WHERE season_id = ?'
  ).get(seasonId).total;

  const remainder = Math.max(0, totalPot - eventDistributed);
  if (remainder <= 0) return { ok: true, distributedCents: 0 };

  const allocations = allocateByBps(
    remainder,
    rules.map((rule) => ({
      rule,
      bps: rule.bps,
    }))
  );

  const ownershipMap = new Map(getOwnershipBySeason(seasonId).map((o) => [o.driver_id, o.participant_id]));

  const insert = db.prepare(`
    INSERT INTO season_bonus_payouts
      (season_id, participant_id, driver_id, category, amount_cents, tie_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let distributed = 0;
  allocations.forEach((allocation, idx) => {
    const rule = rules[idx];
    const winners = resolveSeasonBonusWinners(rule.category, seasonId);
    if (!winners.length || allocation.cents <= 0) return;

    const shares = splitCentsEvenly(allocation.cents, winners.length);
    winners.forEach((driverId, shareIdx) => {
      const participantId = ownershipMap.get(driverId);
      if (!participantId) return;
      distributed += shares[shareIdx];
      insert.run(seasonId, participantId, driverId, rule.category, shares[shareIdx], winners.length);
    });
  });

  return { ok: true, distributedCents: distributed, remainderCents: remainder };
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

function syncEventFromProvider({ seasonId, eventId, provider, io }) {
  const event = getEventById(seasonId, eventId);
  if (!event) return { ok: false, status: 404, error: 'Event not found' };

  const drivers = db.prepare('SELECT external_id FROM drivers WHERE season_id = ?').all(seasonId);

  return Promise.resolve()
    .then(async () => {
      io?.emit('results:sync:started', { eventId, roundNumber: event.round_number, name: event.name });
      const rows = await provider.fetchEventResults({ event, drivers });
      const upsert = upsertEventResults({ seasonId, eventId, rows, manualOverride: false });
      if (!upsert.ok) return upsert;
      const scored = scoreEvent({ seasonId, eventId });
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

async function syncNextEventFromProvider({ seasonId, provider, io }) {
  const event = db.prepare(`
    SELECT *
    FROM events
    WHERE season_id = ?
      AND (status = 'pending' OR status = 'results_loaded')
      AND (starts_at IS NULL OR starts_at <= ?)
    ORDER BY round_number ASC,
      CASE WHEN type = 'sprint' THEN 0 ELSE 1 END ASC
    LIMIT 1
  `).get(seasonId, new Date().toISOString());

  if (!event) return { ok: false, status: 404, error: 'No events pending sync' };
  return syncEventFromProvider({ seasonId, eventId: event.id, provider, io });
}

module.exports = {
  scoreEvent,
  recalcSeasonBonuses,
  upsertEventResults,
  syncEventFromProvider,
  syncNextEventFromProvider,
};
