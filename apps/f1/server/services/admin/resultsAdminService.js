const {
  db,
  getSeason,
  getDrivers,
  getEvents,
  getEventById,
  getEventResults,
  getProviderSyncStates,
  upsertProviderSyncState,
} = require('../../db');
const {
  scoreEvent,
  recalcSeasonBonuses,
  rescoreSeasonEvents,
  upsertEventResults,
  syncEventFromProvider,
  syncNextEventFromProvider,
} = require('../scoringService');
const { shuffleArray } = require('../../lib/shuffle');

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeEventBaseName(value) {
  return normalizeText(value).replace(/\s*\(sprint\)\s*/g, '');
}

function providerEventMatchKey(event) {
  return `${Number(event.round_number) || 0}::${event.type}`;
}

function parseStateRow(row) {
  let meta = {};
  if (row?.meta_json) {
    try {
      meta = JSON.parse(row.meta_json);
    } catch {
      meta = {};
    }
  }

  return {
    scope: row.scope,
    provider: row.provider,
    status: row.status,
    message: row.message,
    updated_at: row.updated_at,
    ...meta,
  };
}

function saveProviderState(seasonId, scope, providerName, status, message, meta) {
  upsertProviderSyncState(seasonId, scope, {
    provider: providerName,
    status,
    message,
    meta,
  });
}

function getProviderName(provider) {
  return provider?.name || 'unknown';
}

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

async function refreshDriversFromProvider({ seasonId, provider }) {
  const providerName = getProviderName(provider);
  const season = getSeason(seasonId);
  if (!season) return { ok: false, status: 404, error: 'Season not found' };

  try {
    const providerDrivers = await provider.fetchDrivers({ year: season.year });
    if (!providerDrivers.length) {
      saveProviderState(seasonId, 'drivers', providerName, 'error', 'Provider returned no drivers.');
      return { ok: false, status: 502, error: 'Provider returned no drivers' };
    }

    const seasonDrivers = getDrivers(seasonId);
    const byCode = new Map(seasonDrivers.map((driver) => [normalizeText(driver.code), driver]));
    const byName = new Map(seasonDrivers.map((driver) => [normalizeText(driver.name), driver]));
    const matched = [];
    const matchedIds = new Set();
    const targetExternalIds = new Set();
    const unmappedProvider = [];

    providerDrivers.forEach((providerDriver) => {
      const codeKey = normalizeText(providerDriver.code);
      const nameKey = normalizeText(providerDriver.name);
      const match = (
        (codeKey && byCode.get(codeKey) && !matchedIds.has(byCode.get(codeKey).id) && byCode.get(codeKey))
        || (nameKey && byName.get(nameKey) && !matchedIds.has(byName.get(nameKey).id) && byName.get(nameKey))
      );

      if (!match) {
        unmappedProvider.push(providerDriver.name || providerDriver.code || 'Unknown driver');
        return;
      }

      if (targetExternalIds.has(providerDriver.external_id)) {
        unmappedProvider.push(providerDriver.name || providerDriver.code || 'Duplicate external id');
        return;
      }

      targetExternalIds.add(providerDriver.external_id);
      matchedIds.add(match.id);
      matched.push({ existing: match, provider: providerDriver });
    });

    const unmatchedSeason = seasonDrivers
      .filter((driver) => !matchedIds.has(driver.id))
      .map((driver) => driver.name);

    if (unmappedProvider.length || unmatchedSeason.length) {
      const message = `Driver mapping failed. Provider unmatched: ${unmappedProvider.length}. Season unmatched: ${unmatchedSeason.length}.`;
      saveProviderState(seasonId, 'drivers', providerName, 'error', message, {
        unmappedProvider,
        unmatchedSeason,
      });
      return { ok: false, status: 400, error: message };
    }

    const update = db.prepare(`
      UPDATE drivers
      SET external_id = ?, code = ?, name = ?, team_name = ?
      WHERE id = ?
    `);
    const clearExternalId = db.prepare(`
      UPDATE drivers
      SET external_id = NULL
      WHERE id = ?
    `);

    db.transaction(() => {
      matched.forEach(({ existing }) => {
        clearExternalId.run(existing.id);
      });
      matched.forEach(({ existing, provider: providerDriver }) => {
        update.run(
          providerDriver.external_id,
          providerDriver.code,
          providerDriver.name,
          providerDriver.team_name,
          existing.id,
        );
      });
    })();

    const message = `Refreshed ${matched.length} drivers from ${providerName}.`;
    saveProviderState(seasonId, 'drivers', providerName, 'success', message, {
      count: matched.length,
    });
    return { ok: true, count: matched.length, message };
  } catch (error) {
    saveProviderState(seasonId, 'drivers', providerName, 'error', error.message || 'Driver refresh failed');
    return { ok: false, status: 502, error: error.message || 'Driver refresh failed' };
  }
}

async function refreshScheduleFromProvider({ seasonId, provider }) {
  const providerName = getProviderName(provider);
  const season = getSeason(seasonId);
  if (!season) return { ok: false, status: 404, error: 'Season not found' };

  try {
    const providerEvents = await provider.fetchSeasonSchedule({ year: season.year });
    if (!providerEvents.length) {
      saveProviderState(seasonId, 'schedule', providerName, 'error', 'Provider returned no schedule events.');
      return { ok: false, status: 502, error: 'Provider returned no schedule events' };
    }

    const existingEvents = getEvents(seasonId);
    const eventMapByRound = new Map(
      existingEvents.map((event) => [providerEventMatchKey(event), event])
    );
    const eventMapByName = new Map(
      existingEvents.map((event) => [`${normalizeEventBaseName(event.name)}::${event.type}`, event])
    );

    const updateEvent = db.prepare(`
      UPDATE events
      SET external_event_id = ?,
          name = ?,
          starts_at = ?,
          lock_at = ?
      WHERE id = ?
    `);
    const insertEvent = db.prepare(`
      INSERT INTO events
        (season_id, external_event_id, round_number, name, type, starts_at, lock_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const deleteEvent = db.prepare('DELETE FROM events WHERE id = ?');

    const updates = [];
    const inserts = [];
    const unmatchedProvider = [];
    const matchedExistingIds = new Set();

    providerEvents.forEach((providerEvent) => {
      const roundKey = providerEventMatchKey(providerEvent);
      const nameKey = `${normalizeEventBaseName(providerEvent.name)}::${providerEvent.type}`;
      const existing = eventMapByRound.get(roundKey) || eventMapByName.get(nameKey);
      if (!existing) {
        if (Number.isFinite(Number(providerEvent.round_number)) && providerEvent.type) {
          inserts.push(providerEvent);
        } else {
          unmatchedProvider.push(providerEvent.name);
        }
        return;
      }
      matchedExistingIds.add(existing.id);
      updates.push({ existing, provider: providerEvent });
    });

    const removableExisting = existingEvents.filter((event) => (
      !matchedExistingIds.has(event.id)
      && event.status !== 'scored'
      && Number(event.result_count || 0) === 0
      && Number(event.total_payout_cents || 0) === 0
    ));
    const retainedExisting = existingEvents.filter((event) => (
      !matchedExistingIds.has(event.id)
      && !removableExisting.some((candidate) => candidate.id === event.id)
    ));

    db.transaction(() => {
      updates.forEach(({ existing, provider: providerEvent }) => {
        updateEvent.run(
          providerEvent.external_event_id,
          providerEvent.name,
          providerEvent.starts_at,
          providerEvent.lock_at,
          existing.id,
        );
      });
      inserts.forEach((providerEvent) => {
        insertEvent.run(
          seasonId,
          providerEvent.external_event_id,
          providerEvent.round_number,
          providerEvent.name,
          providerEvent.type,
          providerEvent.starts_at,
          providerEvent.lock_at,
        );
      });
      removableExisting.forEach((event) => {
        deleteEvent.run(event.id);
      });
    })();

    const warningParts = [];
    if (unmatchedProvider.length) {
      warningParts.push(`${unmatchedProvider.length} provider events were not matched`);
    }
    if (retainedExisting.length) {
      warningParts.push(`${retainedExisting.length} existing events were retained because they already contain results or payouts`);
    }
    const status = warningParts.length ? 'warning' : 'success';
    const message = warningParts.length
      ? `Refreshed ${updates.length + inserts.length} schedule events from ${providerName}; removed ${removableExisting.length} stale events. ${warningParts.join('. ')}.`
      : `Refreshed ${updates.length + inserts.length} schedule events from ${providerName}.`;

    saveProviderState(seasonId, 'schedule', providerName, status, message, {
      count: updates.length + inserts.length,
      insertedCount: inserts.length,
      removedCount: removableExisting.length,
      retainedExisting: retainedExisting.map((event) => event.name),
      unmatchedProvider,
    });

    return {
      ok: true,
      count: updates.length + inserts.length,
      insertedCount: inserts.length,
      removedCount: removableExisting.length,
      unmatchedCount: unmatchedProvider.length,
      message,
    };
  } catch (error) {
    saveProviderState(seasonId, 'schedule', providerName, 'error', error.message || 'Schedule refresh failed');
    return { ok: false, status: 502, error: error.message || 'Schedule refresh failed' };
  }
}

function getProviderStatus({ seasonId, provider, autoPollService }) {
  const stateRows = getProviderSyncStates(seasonId).map(parseStateRow);
  const states = Object.fromEntries(stateRows.map((row) => [row.scope, row]));
  const providerInfo = typeof provider?.getStatus === 'function' ? provider.getStatus() : {};
  const autoPollInfo = typeof autoPollService?.getStatus === 'function' ? autoPollService.getStatus() : null;

  return {
    provider: getProviderName(provider),
    mode: process.env.NODE_ENV || 'development',
    provider_info: providerInfo,
    last_driver_refresh: states.drivers || null,
    last_schedule_refresh: states.schedule || null,
    auto_poll: {
      ...(states.auto_poll || {}),
      ...(autoPollInfo || {}),
    },
  };
}

function clearTestDataForSeason({ seasonId, io, auctionService }) {
  const season = getSeason(seasonId);
  if (!season) return { ok: false, status: 404, error: 'Season not found' };

  if (typeof auctionService?.clearActiveTimer === 'function') {
    auctionService.clearActiveTimer();
  }

  const participantIds = db.prepare(`
    SELECT id
    FROM participants
    WHERE is_admin = 0
      AND id IN (
        SELECT participant_id
        FROM season_participants
        WHERE season_id = ?
      )
  `).all(seasonId).map((row) => row.id);

  const eventIds = getEvents(seasonId).map((event) => event.id);

  db.transaction(() => {
    db.prepare(`
      UPDATE seasons
      SET auction_status = 'waiting',
          season_random_bonus_position = NULL,
          season_random_bonus_drawn_at = NULL
      WHERE id = ?
    `).run(seasonId);

    db.prepare(`
      UPDATE auction_items
      SET status = 'pending',
          current_price_cents = 0,
          current_leader_id = NULL,
          bid_end_time = NULL,
          final_price_cents = NULL,
          winner_id = NULL
      WHERE season_id = ?
    `).run(seasonId);

    db.prepare(`
      UPDATE events
      SET status = 'pending',
          random_bonus_position = NULL,
          random_bonus_drawn_at = NULL,
          synced_at = NULL
      WHERE season_id = ?
    `).run(seasonId);

    if (eventIds.length) {
      const placeholders = eventIds.map(() => '?').join(', ');
      db.prepare(`DELETE FROM event_results WHERE event_id IN (${placeholders})`).run(...eventIds);
    }

    db.prepare('DELETE FROM event_payouts WHERE season_id = ?').run(seasonId);
    db.prepare('DELETE FROM season_bonus_payouts WHERE season_id = ?').run(seasonId);
    db.prepare('DELETE FROM ownership WHERE season_id = ?').run(seasonId);
    db.prepare('DELETE FROM bids WHERE season_id = ?').run(seasonId);
    db.prepare('DELETE FROM provider_sync_state WHERE season_id = ?').run(seasonId);

    if (participantIds.length) {
      const placeholders = participantIds.map(() => '?').join(', ');
      db.prepare(`
        DELETE FROM season_participants
        WHERE season_id = ?
          AND participant_id IN (${placeholders})
      `).run(seasonId, ...participantIds);

      db.prepare(`
        DELETE FROM participants
        WHERE is_admin = 0
          AND id IN (${placeholders})
      `).run(...participantIds);
    }
  })();

  io?.emit('auction:status', { status: 'waiting' });
  io?.emit('standings:update');
  if (auctionService?.emitAuctionState && io) {
    auctionService.emitAuctionState(io, seasonId);
  }

  return {
    ok: true,
    message: 'Cleared auction, results, payouts, and non-admin participants for the active season.',
  };
}

async function loadHistoricalSeasonMetadata({ seasonId, provider, year, io, auctionService }) {
  const season = getSeason(seasonId);
  const parsedYear = Number(year);
  const providerName = getProviderName(provider);

  if (!season) return { ok: false, status: 404, error: 'Season not found' };
  if (!Number.isFinite(parsedYear)) {
    return { ok: false, status: 400, error: 'A numeric year is required.' };
  }
  if (parsedYear !== 2025) {
    return { ok: false, status: 400, error: 'Only 2025 historical metadata is supported right now.' };
  }

  try {
    const [drivers, events] = await Promise.all([
      provider.fetchDrivers({ year: parsedYear }),
      provider.fetchSeasonSchedule({ year: parsedYear }),
    ]);

    if (!drivers.length) {
      return { ok: false, status: 502, error: `Provider returned no drivers for ${parsedYear}.` };
    }
    if (!events.length) {
      return { ok: false, status: 502, error: `Provider returned no events for ${parsedYear}.` };
    }

    clearTestDataForSeason({ seasonId, io: null, auctionService });

    const deleteAuctionItems = db.prepare('DELETE FROM auction_items WHERE season_id = ?');
    const deleteDrivers = db.prepare('DELETE FROM drivers WHERE season_id = ?');
    const deleteEvents = db.prepare('DELETE FROM events WHERE season_id = ?');
    const insertDriver = db.prepare(`
      INSERT INTO drivers (season_id, external_id, code, name, team_name, active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    const insertAuctionItem = db.prepare(`
      INSERT INTO auction_items (season_id, driver_id, queue_order)
      VALUES (?, ?, ?)
    `);
    const insertEvent = db.prepare(`
      INSERT INTO events
        (season_id, external_event_id, round_number, name, type, starts_at, lock_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertedDriverIds = [];

    db.transaction(() => {
      deleteAuctionItems.run(seasonId);
      deleteDrivers.run(seasonId);
      deleteEvents.run(seasonId);

      drivers.forEach((driver) => {
        const insert = insertDriver.run(
          seasonId,
          driver.external_id,
          driver.code,
          driver.name,
          driver.team_name,
        );
        insertedDriverIds.push(insert.lastInsertRowid);
      });

      shuffleArray(insertedDriverIds).forEach((driverId, idx) => {
        insertAuctionItem.run(seasonId, driverId, idx);
      });

      events.forEach((event) => {
        insertEvent.run(
          seasonId,
          event.external_event_id || `historical-${parsedYear}-${event.round_number}-${event.type}`,
          event.round_number,
          event.name,
          event.type,
          event.starts_at,
          event.lock_at,
        );
      });
    })();

    saveProviderState(seasonId, 'drivers', providerName, 'success', `Loaded ${drivers.length} drivers from ${parsedYear}.`, {
      count: drivers.length,
      year: parsedYear,
      source: 'historical-load',
    });
    saveProviderState(seasonId, 'schedule', providerName, 'success', `Loaded ${events.length} events from ${parsedYear}.`, {
      count: events.length,
      year: parsedYear,
      source: 'historical-load',
    });

    io?.emit('auction:status', { status: 'waiting' });
    io?.emit('standings:update');
    if (auctionService?.emitAuctionState && io) {
      auctionService.emitAuctionState(io, seasonId);
    }

    return {
      ok: true,
      year: parsedYear,
      driverCount: drivers.length,
      eventCount: events.length,
      message: `Loaded ${parsedYear} OpenF1 drivers and events for testing.`,
    };
  } catch (error) {
    saveProviderState(seasonId, 'drivers', providerName, 'error', error.message || 'Historical driver load failed', {
      year: parsedYear,
      source: 'historical-load',
    });
    saveProviderState(seasonId, 'schedule', providerName, 'error', error.message || 'Historical schedule load failed', {
      year: parsedYear,
      source: 'historical-load',
    });
    return { ok: false, status: 502, error: error.message || 'Historical metadata load failed' };
  }
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

function rescoreSeasonEventsForSeason({ seasonId, io }) {
  const result = rescoreSeasonEvents({ seasonId });
  if (!result.ok) return result;
  io?.emit('standings:update');
  return { ok: true, ...result, message: `Rescored ${result.rescoredEvents} scored events under the current rule set.` };
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
  refreshDriversFromProvider,
  refreshScheduleFromProvider,
  getProviderStatus,
  clearTestDataForSeason,
  loadHistoricalSeasonMetadata,
  getEventEditorData,
  saveManualResultsAndScore,
  recalcSeasonBonusesForSeason,
  rescoreSeasonEventsForSeason,
  getSeasonBonusPayouts,
};
