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
  const payoutAuditService = require('../services/payoutAuditService');
  return { ...dbModule, ...scoringService, ...payoutAuditService };
}

function setupDb() {
  process.env.DB_PATH = path.join(
    os.tmpdir(),
    `f1-calcutta-audit-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`,
  );
  const modules = freshModules();
  modules.init();
  return modules;
}

function seedParticipant(db, seasonId, { name, color, token }) {
  const participantId = db.prepare(`
    INSERT INTO participants (name, color, session_token)
    VALUES (?, ?, ?)
  `).run(name, color, token).lastInsertRowid;

  db.prepare('INSERT INTO season_participants (season_id, participant_id) VALUES (?, ?)').run(seasonId, participantId);
  return participantId;
}

test('buildEventPayoutAudit returns all active rules with pending_results status when no event results exist', () => {
  const {
    getActiveSeasonId,
    buildEventPayoutAudit,
    getEventPayoutRules,
    db,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  const event = db.prepare(`
    SELECT id, type
    FROM events
    WHERE season_id = ? AND type = 'grand_prix'
    ORDER BY round_number ASC
    LIMIT 1
  `).get(seasonId);

  const audit = buildEventPayoutAudit({ seasonId, eventId: event.id });
  const activeRules = getEventPayoutRules(seasonId, event.type);

  assert.equal(audit.rules.length, activeRules.length);
  assert.equal(audit.has_results, false);
  audit.rules.forEach((rule) => {
    assert.equal(rule.status, 'pending_results');
    assert.equal(rule.winner_count, 0);
    assert.equal(rule.distributed_cents, 0);
  });
});

test('buildEventPayoutAudit reports tie split math with uneven remainder', () => {
  const {
    db,
    getActiveSeasonId,
    upsertEventResults,
    scoreEvent,
    buildEventPayoutAudit,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  const event = db.prepare(`
    SELECT id
    FROM events
    WHERE season_id = ? AND type = 'grand_prix'
    ORDER BY round_number ASC
    LIMIT 1
  `).get(seasonId);

  db.prepare('UPDATE events SET lock_at = ? WHERE id = ?').run('2000-01-01T00:00:00Z', event.id);

  const p1 = seedParticipant(db, seasonId, { name: 'Audit-A', color: '#ff4d4f', token: 'audit-a' });
  const p2 = seedParticipant(db, seasonId, { name: 'Audit-B', color: '#40a9ff', token: 'audit-b' });

  const drivers = db.prepare(`
    SELECT id, external_id
    FROM drivers
    WHERE season_id = ?
    ORDER BY external_id ASC
    LIMIT 3
  `).all(seasonId);
  const [d1, d2, d3] = drivers;

  db.prepare(`
    INSERT INTO ownership (season_id, driver_id, participant_id, purchase_price_cents)
    VALUES (?, ?, ?, ?)
  `).run(seasonId, d1.id, p1, 500);
  db.prepare(`
    INSERT INTO ownership (season_id, driver_id, participant_id, purchase_price_cents)
    VALUES (?, ?, ?, ?)
  `).run(seasonId, d2.id, p2, 500);

  upsertEventResults({
    seasonId,
    eventId: event.id,
    rows: [
      { external_driver_id: d1.external_id, finish_position: 6, start_position: 11 },
      { external_driver_id: d2.external_id, finish_position: 7, start_position: 12 },
      { external_driver_id: d3.external_id, finish_position: 1, start_position: 1 },
    ],
  });

  const scored = scoreEvent({ seasonId, eventId: event.id });
  assert.equal(scored.ok, true);

  const audit = buildEventPayoutAudit({ seasonId, eventId: event.id });
  const mostGainRule = audit.rules.find((rule) => rule.category === 'most_positions_gained');

  assert.ok(mostGainRule);
  assert.equal(mostGainRule.winner_count, 2);
  assert.equal(mostGainRule.status, 'paid');
  assert.equal(mostGainRule.category_pot_cents, 5);
  assert.equal(mostGainRule.distributed_cents, 5);

  const shares = mostGainRule.winners.map((winner) => winner.split_share_cents).sort((a, b) => a - b);
  assert.deepEqual(shares, [2, 3]);
});

test('buildEventPayoutAudit marks unowned winner categories as undistributed', () => {
  const {
    db,
    getActiveSeasonId,
    upsertEventResults,
    scoreEvent,
    buildEventPayoutAudit,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  const event = db.prepare(`
    SELECT id
    FROM events
    WHERE season_id = ? AND type = 'grand_prix'
    ORDER BY round_number ASC
    LIMIT 1
  `).get(seasonId);

  db.prepare('UPDATE events SET lock_at = ? WHERE id = ?').run('2000-01-01T00:00:00Z', event.id);

  const driver = db.prepare(`
    SELECT id, external_id
    FROM drivers
    WHERE season_id = ?
    ORDER BY external_id ASC
    LIMIT 1
  `).get(seasonId);
  const ownedDriver = db.prepare(`
    SELECT id
    FROM drivers
    WHERE season_id = ?
    ORDER BY external_id ASC
    LIMIT 1 OFFSET 1
  `).get(seasonId);

  const ownerParticipantId = seedParticipant(db, seasonId, { name: 'Audit-Owned', color: '#9254de', token: 'audit-owned' });
  db.prepare(`
    INSERT INTO ownership (season_id, driver_id, participant_id, purchase_price_cents)
    VALUES (?, ?, ?, ?)
  `).run(seasonId, ownedDriver.id, ownerParticipantId, 1000);

  upsertEventResults({
    seasonId,
    eventId: event.id,
    rows: [{ external_driver_id: driver.external_id, finish_position: 1, start_position: 4 }],
  });
  assert.equal(scoreEvent({ seasonId, eventId: event.id }).ok, true);

  const audit = buildEventPayoutAudit({ seasonId, eventId: event.id });
  const raceWinnerRule = audit.rules.find((rule) => rule.category === 'race_winner');

  assert.ok(raceWinnerRule);
  assert.equal(raceWinnerRule.winner_count, 1);
  assert.equal(raceWinnerRule.distributed_cents, 0);
  assert.ok(raceWinnerRule.undistributed_cents > 0);
  assert.equal(raceWinnerRule.status, 'unowned_winners');
});

test('buildEventPayoutAudit includes random bonus target and winner details', () => {
  const {
    db,
    getActiveSeasonId,
    upsertEventResults,
    scoreEvent,
    buildEventPayoutAudit,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  const event = db.prepare(`
    SELECT id
    FROM events
    WHERE season_id = ? AND type = 'grand_prix'
    ORDER BY round_number ASC
    LIMIT 1
  `).get(seasonId);

  db.prepare('UPDATE events SET lock_at = ?, random_bonus_position = ? WHERE id = ?').run(
    '2000-01-01T00:00:00Z',
    9,
    event.id
  );

  const participantId = seedParticipant(db, seasonId, { name: 'Audit-Random', color: '#73d13d', token: 'audit-r' });
  const driver = db.prepare(`
    SELECT id, external_id
    FROM drivers
    WHERE season_id = ?
    ORDER BY external_id ASC
    LIMIT 1
  `).get(seasonId);

  db.prepare(`
    INSERT INTO ownership (season_id, driver_id, participant_id, purchase_price_cents)
    VALUES (?, ?, ?, ?)
  `).run(seasonId, driver.id, participantId, 1000);

  upsertEventResults({
    seasonId,
    eventId: event.id,
    rows: [{ external_driver_id: driver.external_id, finish_position: 9, start_position: 12 }],
  });
  assert.equal(scoreEvent({ seasonId, eventId: event.id }).ok, true);

  const audit = buildEventPayoutAudit({ seasonId, eventId: event.id });
  const randomRule = audit.rules.find((rule) => rule.category === 'random_finish_bonus');

  assert.ok(randomRule);
  assert.equal(randomRule.resolution.target_value, 9);
  assert.equal(randomRule.winner_count, 1);
  assert.equal(randomRule.winners[0].owner_participant_name, 'Audit-Random');
});

test('buildEventPayoutAuditCsv returns a rule-level CSV export', () => {
  const {
    db,
    getActiveSeasonId,
    upsertEventResults,
    scoreEvent,
    buildEventPayoutAuditCsv,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  const event = db.prepare(`
    SELECT id
    FROM events
    WHERE season_id = ? AND type = 'grand_prix'
    ORDER BY round_number ASC
    LIMIT 1
  `).get(seasonId);

  db.prepare('UPDATE events SET lock_at = ? WHERE id = ?').run('2000-01-01T00:00:00Z', event.id);
  const participantId = seedParticipant(db, seasonId, { name: 'Audit-CSV', color: '#36cfc9', token: 'audit-csv' });
  const driver = db.prepare(`
    SELECT id, external_id
    FROM drivers
    WHERE season_id = ?
    ORDER BY external_id ASC
    LIMIT 1
  `).get(seasonId);

  db.prepare(`
    INSERT INTO ownership (season_id, driver_id, participant_id, purchase_price_cents)
    VALUES (?, ?, ?, ?)
  `).run(seasonId, driver.id, participantId, 1000);

  upsertEventResults({
    seasonId,
    eventId: event.id,
    rows: [{ external_driver_id: driver.external_id, finish_position: 1, start_position: 3 }],
  });
  assert.equal(scoreEvent({ seasonId, eventId: event.id }).ok, true);

  const csv = buildEventPayoutAuditCsv({ seasonId, eventId: event.id });
  assert.match(csv, /Event Name,Australian Grand Prix/i);
  assert.match(csv, /Rule Label,Category,BPS/i);
  assert.match(csv, /Race Winner/);
  assert.match(csv, /Audit-CSV/);
});

test('buildEventPayoutAuditWinnerCsv returns one row per winner or empty outcome', () => {
  const {
    db,
    getActiveSeasonId,
    upsertEventResults,
    scoreEvent,
    buildEventPayoutAuditWinnerCsv,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  const event = db.prepare(`
    SELECT id
    FROM events
    WHERE season_id = ? AND type = 'grand_prix'
    ORDER BY round_number ASC
    LIMIT 1
  `).get(seasonId);

  db.prepare('UPDATE events SET lock_at = ? WHERE id = ?').run('2000-01-01T00:00:00Z', event.id);
  const participantId = seedParticipant(db, seasonId, { name: 'Audit-Winner-CSV', color: '#73d13d', token: 'audit-winner-csv' });
  const driver = db.prepare(`
    SELECT id, external_id
    FROM drivers
    WHERE season_id = ?
    ORDER BY external_id ASC
    LIMIT 1
  `).get(seasonId);

  db.prepare(`
    INSERT INTO ownership (season_id, driver_id, participant_id, purchase_price_cents)
    VALUES (?, ?, ?, ?)
  `).run(seasonId, driver.id, participantId, 1000);

  upsertEventResults({
    seasonId,
    eventId: event.id,
    rows: [{ external_driver_id: driver.external_id, finish_position: 1, start_position: 2 }],
  });
  assert.equal(scoreEvent({ seasonId, eventId: event.id }).ok, true);

  const csv = buildEventPayoutAuditWinnerCsv({ seasonId, eventId: event.id });
  assert.match(csv, /Rule Label,Category,Rule Pot Cents,Rule Status,Driver Name/i);
  assert.match(csv, /Audit-Winner-CSV/);
  assert.match(csv, /Race Winner/);
});
