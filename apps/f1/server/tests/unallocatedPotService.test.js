const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');

function freshModules() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes('/apps/f1/server/')) {
      delete require.cache[key];
    }
  }

  const dbModule = require('../db');
  const scoringService = require('../services/scoringService');
  const resultsAdminService = require('../services/admin/resultsAdminService');
  const unallocatedPotService = require('../services/unallocatedPotService');
  return { ...dbModule, ...scoringService, resultsAdminService, ...unallocatedPotService };
}

function setupDb() {
  process.env.DB_PATH = path.join(
    os.tmpdir(),
    `f1-calcutta-unallocated-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`,
  );
  const modules = freshModules();
  modules.init();
  return modules;
}

function seedParticipant(db, seasonId, name, token) {
  const id = db.prepare(`
    INSERT INTO participants (name, color, session_token)
    VALUES (?, '#8888ff', ?)
  `).run(name, token).lastInsertRowid;
  db.prepare('INSERT INTO season_participants (season_id, participant_id) VALUES (?, ?)').run(seasonId, id);
  return id;
}

// Give the season a real pot so per-category cents are non-trivial, and leave
// `leaveUnownedFromExternalId` without an ownership row.
function seedPotOwnership(db, seasonId, participantId, { leaveUnownedExternalIds = [] } = {}) {
  const drivers = db.prepare('SELECT id, external_id FROM drivers WHERE season_id = ? ORDER BY external_id ASC').all(seasonId);
  const skip = new Set(leaveUnownedExternalIds);
  drivers.forEach((driver) => {
    if (skip.has(driver.external_id)) return;
    db.prepare(`
      INSERT INTO ownership (season_id, driver_id, participant_id, purchase_price_cents)
      VALUES (?, ?, ?, ?)
    `).run(seasonId, driver.id, participantId, 500000);
  });
}

function firstGrandPrix(db, seasonId) {
  const event = db.prepare(`
    SELECT id FROM events
    WHERE season_id = ? AND type = 'grand_prix'
    ORDER BY round_number ASC LIMIT 1
  `).get(seasonId);
  db.prepare('UPDATE events SET lock_at = ? WHERE id = ?').run('2000-01-01T00:00:00Z', event.id);
  return event;
}

test('no scored events -> zero total and pending season bonus', () => {
  const { db, getActiveSeasonId, buildSeasonUnallocatedSummary } = setupDb();
  const seasonId = getActiveSeasonId();

  const summary = buildSeasonUnallocatedSummary({ seasonId });
  assert.equal(summary.totalCents, 0);
  assert.equal(summary.eventCents, 0);
  assert.equal(summary.contributingEvents.length, 0);
  assert.equal(summary.seasonBonus.resolved, false);
  assert.equal(summary.seasonBonus.unallocatedCents, 0);
  assert.equal(summary.isFinal, false);
});

test('scored event with every winner owned -> zero unallocated', () => {
  const {
    db, getActiveSeasonId, upsertEventResults, scoreEvent, buildSeasonUnallocatedSummary,
  } = setupDb();
  const seasonId = getActiveSeasonId();
  const owner = seedParticipant(db, seasonId, 'Owner', 'tok-owner');
  seedPotOwnership(db, seasonId, owner);
  const event = firstGrandPrix(db, seasonId);

  const drivers = db.prepare('SELECT external_id FROM drivers WHERE season_id = ? ORDER BY external_id ASC').all(seasonId);
  upsertEventResults({
    seasonId,
    eventId: event.id,
    rows: drivers.map((driver, index) => ({
      external_driver_id: driver.external_id,
      finish_position: index + 1,
      start_position: ((index + 5) % drivers.length) + 1,
      slowest_pit_stop_seconds: 2 + (index * 0.1),
    })),
  });
  assert.equal(scoreEvent({ seasonId, eventId: event.id }).ok, true);

  const summary = buildSeasonUnallocatedSummary({ seasonId });
  assert.equal(summary.totalCents, 0);
  assert.equal(summary.contributingEvents.length, 0);
});

test('scored event won by an unowned substitute -> that category value is tracked', () => {
  const {
    db, getActiveSeasonId, upsertEventResults, scoreEvent, buildSeasonUnallocatedSummary,
  } = setupDb();
  const seasonId = getActiveSeasonId();
  const owner = seedParticipant(db, seasonId, 'Owner', 'tok-owner');
  seedPotOwnership(db, seasonId, owner);
  const event = firstGrandPrix(db, seasonId);

  const roster = db.prepare('SELECT external_id FROM drivers WHERE season_id = ? ORDER BY external_id ASC').all(seasonId);

  // Substitute (external id 777) is not in the roster -> created inactive/unowned,
  // and wins the race.
  const rows = [
    { external_driver_id: 777, driver_code: 'SUB', driver_name: 'Sub Driver', team_name: 'Cadillac', finish_position: 1, start_position: 12 },
    ...roster.map((driver, index) => ({
      external_driver_id: driver.external_id,
      finish_position: index + 2,
      start_position: index + 2,
      slowest_pit_stop_seconds: 2 + (index * 0.1),
    })),
  ];
  upsertEventResults({ seasonId, eventId: event.id, rows });
  assert.equal(scoreEvent({ seasonId, eventId: event.id }).ok, true);

  const summary = buildSeasonUnallocatedSummary({ seasonId });
  assert.ok(summary.totalCents > 0);
  assert.equal(summary.contributingEvents.length, 1);

  const contribution = summary.contributingEvents[0];
  assert.equal(contribution.eventId, event.id);
  assert.equal(contribution.unallocatedCents, summary.eventCents);
  assert.equal(
    contribution.unallocatedCents,
    contribution.categories.reduce((sum, category) => sum + category.unallocatedCents, 0),
  );

  const raceWinner = contribution.categories.find((category) => category.category === 'race_winner');
  assert.ok(raceWinner, 'race_winner category should be flagged');
  assert.equal(raceWinner.status, 'unowned_winners');
  assert.equal(raceWinner.unownedWinners[0].driverName, 'Sub Driver');

  // Tier-1 (pot - paid) matches tier-2 (sum of per-category undistributed).
  const tier2 = summary.contributingEvents
    .flatMap((entry) => entry.categories)
    .reduce((sum, category) => sum + category.unallocatedCents, 0);
  assert.equal(summary.eventCents, tier2);
});

test('category no driver satisfied is counted as unallocated', () => {
  const {
    db, getActiveSeasonId, upsertEventResults, scoreEvent, buildSeasonUnallocatedSummary,
  } = setupDb();
  const seasonId = getActiveSeasonId();
  const owner = seedParticipant(db, seasonId, 'Owner', 'tok-owner');
  seedPotOwnership(db, seasonId, owner);
  const event = firstGrandPrix(db, seasonId);
  // Force a known random bonus target so we can dodge it deterministically.
  db.prepare('UPDATE events SET random_bonus_position = 15 WHERE id = ?').run(event.id);

  const [d1] = db.prepare('SELECT external_id FROM drivers WHERE season_id = ? ORDER BY external_id ASC LIMIT 1').all(seasonId);

  // Only one classified finisher (P1), no pit data -> slowest_pit_stop and
  // random_finish_bonus (P15) have no winner and go unallocated.
  upsertEventResults({
    seasonId,
    eventId: event.id,
    rows: [{ external_driver_id: d1.external_id, finish_position: 1, start_position: 1 }],
  });
  assert.equal(scoreEvent({ seasonId, eventId: event.id }).ok, true);

  const summary = buildSeasonUnallocatedSummary({ seasonId });
  assert.ok(summary.totalCents > 0);
  const categories = summary.contributingEvents[0].categories.map((category) => category.category);
  assert.ok(categories.includes('slowest_pit_stop'));
  assert.ok(categories.includes('random_finish_bonus'));
  summary.contributingEvents[0].categories.forEach((category) => {
    if (['slowest_pit_stop', 'random_finish_bonus'].includes(category.category)) {
      assert.equal(category.status, 'no_winners');
    }
  });
});

test('pending (unscored) event does not contribute', () => {
  const {
    db, getActiveSeasonId, upsertEventResults, buildSeasonUnallocatedSummary,
  } = setupDb();
  const seasonId = getActiveSeasonId();
  const owner = seedParticipant(db, seasonId, 'Owner', 'tok-owner');
  seedPotOwnership(db, seasonId, owner);
  const event = firstGrandPrix(db, seasonId);

  upsertEventResults({
    seasonId,
    eventId: event.id,
    rows: [{ external_driver_id: 777, driver_name: 'Sub', team_name: 'X', finish_position: 1, start_position: 10 }],
  });
  // Deliberately not scored.

  const summary = buildSeasonUnallocatedSummary({ seasonId });
  assert.equal(summary.totalCents, 0);
  assert.equal(summary.contributingEvents.length, 0);
});

test('cancelled event does not contribute (no double count with redistribution)', () => {
  const {
    db, getActiveSeasonId, buildSeasonUnallocatedSummary, resultsAdminService,
  } = setupDb();
  const seasonId = getActiveSeasonId();
  const owner = seedParticipant(db, seasonId, 'Owner', 'tok-owner');
  seedPotOwnership(db, seasonId, owner);
  const event = firstGrandPrix(db, seasonId);

  const cancel = resultsAdminService.cancelEventForSeason({ seasonId, eventId: event.id });
  assert.equal(cancel.ok, true);

  const summary = buildSeasonUnallocatedSummary({ seasonId });
  assert.equal(summary.eventCents, 0);
  assert.equal(summary.contributingEvents.length, 0);
});

test('assigning ownership to the substitute and rescoring clears the tracked value', () => {
  const {
    db, getActiveSeasonId, upsertEventResults, scoreEvent, buildSeasonUnallocatedSummary,
  } = setupDb();
  const seasonId = getActiveSeasonId();
  const owner = seedParticipant(db, seasonId, 'Owner', 'tok-owner');
  seedPotOwnership(db, seasonId, owner);
  const event = firstGrandPrix(db, seasonId);

  const roster = db.prepare('SELECT external_id FROM drivers WHERE season_id = ? ORDER BY external_id ASC').all(seasonId);
  upsertEventResults({
    seasonId,
    eventId: event.id,
    rows: [
      { external_driver_id: 777, driver_code: 'SUB', driver_name: 'Sub Driver', team_name: 'Cadillac', finish_position: 1, start_position: 12, slowest_pit_stop_seconds: 2.5 },
      ...roster.map((driver, index) => ({
        external_driver_id: driver.external_id,
        finish_position: index + 2,
        start_position: index + 2,
        // Ensure an owned driver holds the slowest stop so that category pays out.
        slowest_pit_stop_seconds: 3 + (index * 0.1),
      })),
    ],
  });
  assert.equal(scoreEvent({ seasonId, eventId: event.id }).ok, true);
  assert.ok(buildSeasonUnallocatedSummary({ seasonId }).totalCents > 0);

  const sub = db.prepare('SELECT id FROM drivers WHERE season_id = ? AND external_id = 777').get(seasonId);
  db.prepare(`
    INSERT INTO ownership (season_id, driver_id, participant_id, purchase_price_cents)
    VALUES (?, ?, ?, ?)
  `).run(seasonId, sub.id, owner, 0);
  assert.equal(scoreEvent({ seasonId, eventId: event.id, ignoreLock: true }).ok, true);

  assert.equal(buildSeasonUnallocatedSummary({ seasonId }).totalCents, 0);
});

test('season bonus won by an unowned driver is counted once the season is complete', () => {
  const {
    db, getActiveSeasonId, upsertEventResults, scoreEvent, buildSeasonUnallocatedSummary,
  } = setupDb();
  const seasonId = getActiveSeasonId();
  const owner = seedParticipant(db, seasonId, 'Owner', 'tok-owner');

  // Leave external id 1 unowned; everyone else owned.
  seedPotOwnership(db, seasonId, owner, { leaveUnownedExternalIds: [1] });

  // Collapse the season to a single grand prix so it can be "complete".
  const keep = db.prepare(`
    SELECT id FROM events
    WHERE season_id = ? AND type = 'grand_prix'
    ORDER BY round_number ASC LIMIT 1
  `).get(seasonId);
  db.prepare('DELETE FROM events WHERE season_id = ? AND id != ?').run(seasonId, keep.id);
  db.prepare('UPDATE events SET lock_at = ? WHERE id = ?').run('2000-01-01T00:00:00Z', keep.id);

  const roster = db.prepare('SELECT id, external_id FROM drivers WHERE season_id = ? ORDER BY external_id ASC').all(seasonId);
  const unownedDriver = roster.find((driver) => driver.external_id === 1);

  // Unowned driver wins -> leads the championship -> drivers_champion bonus is unowned.
  upsertEventResults({
    seasonId,
    eventId: keep.id,
    rows: roster.map((driver) => ({
      external_driver_id: driver.external_id,
      finish_position: driver.external_id === 1 ? 1 : driver.external_id + 1,
      start_position: driver.external_id + 1,
    })),
  });
  assert.equal(scoreEvent({ seasonId, eventId: keep.id }).ok, true);

  const summary = buildSeasonUnallocatedSummary({ seasonId });
  assert.equal(summary.isFinal, true);
  assert.equal(summary.seasonBonus.resolved, true);
  assert.ok(summary.seasonBonus.unallocatedCents > 0);

  const champion = summary.seasonBonus.categories.find((category) => category.category === 'drivers_champion');
  assert.ok(champion, 'drivers_champion bonus should be flagged as unallocated');
  assert.equal(champion.unownedWinners[0].driverName, db.prepare('SELECT name FROM drivers WHERE id = ?').get(unownedDriver.id).name);
  assert.equal(summary.totalCents, summary.eventCents + summary.seasonBonus.unallocatedCents);
});
