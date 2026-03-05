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
  const scoring = require('../services/scoringService');
  const auctionModule = require('../services/auctionService');
  return { ...dbModule, ...scoring, ...auctionModule };
}

function setupDb() {
  process.env.DB_PATH = path.join(
    os.tmpdir(),
    `f1-calcutta-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`,
  );
  const modules = freshModules();
  modules.init();
  return modules;
}

test('scoring splits tied category payout evenly between tied winners', () => {
  const {
    db,
    getActiveSeasonId,
    upsertEventResults,
    scoreEvent,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  const event = db.prepare("SELECT id FROM events WHERE season_id = ? AND type = 'grand_prix' ORDER BY round_number LIMIT 1").get(seasonId);
  db.prepare('UPDATE events SET lock_at = ? WHERE id = ?').run('2000-01-01T00:00:00Z', event.id);

  const p1 = db.prepare("INSERT INTO participants (name, color, session_token) VALUES ('Alice', '#ff4d4f', 'tok-a')").run().lastInsertRowid;
  const p2 = db.prepare("INSERT INTO participants (name, color, session_token) VALUES ('Bob', '#40a9ff', 'tok-b')").run().lastInsertRowid;

  db.prepare('INSERT INTO season_participants (season_id, participant_id) VALUES (?, ?)').run(seasonId, p1);
  db.prepare('INSERT INTO season_participants (season_id, participant_id) VALUES (?, ?)').run(seasonId, p2);

  const d1 = db.prepare('SELECT id, external_id FROM drivers WHERE season_id = ? ORDER BY external_id LIMIT 1').get(seasonId);
  const d2 = db.prepare('SELECT id, external_id FROM drivers WHERE season_id = ? ORDER BY external_id LIMIT 1 OFFSET 1').get(seasonId);
  const d3 = db.prepare('SELECT id, external_id FROM drivers WHERE season_id = ? ORDER BY external_id LIMIT 1 OFFSET 2').get(seasonId);

  db.prepare('INSERT INTO ownership (season_id, driver_id, participant_id, purchase_price_cents) VALUES (?, ?, ?, ?)').run(seasonId, d1.id, p1, 5000);
  db.prepare('INSERT INTO ownership (season_id, driver_id, participant_id, purchase_price_cents) VALUES (?, ?, ?, ?)').run(seasonId, d2.id, p2, 5000);

  const upsert = upsertEventResults({
    seasonId,
    eventId: event.id,
    rows: [
      { external_driver_id: d1.external_id, finish_position: 6, start_position: 10 },
      { external_driver_id: d2.external_id, finish_position: 7, start_position: 11 },
      { external_driver_id: d3.external_id, finish_position: 1, start_position: 1 },
    ],
  });
  assert.equal(upsert.ok, true);

  const score = scoreEvent({ seasonId, eventId: event.id });
  assert.equal(score.ok, true);

  const mostGainedPayouts = db.prepare(`
    SELECT participant_id, amount_cents
    FROM event_payouts
    WHERE season_id = ? AND event_id = ? AND category = 'most_positions_gained'
    ORDER BY participant_id
  `).all(seasonId, event.id);

  assert.equal(mostGainedPayouts.length, 2);
  assert.deepEqual(mostGainedPayouts.map((p) => p.amount_cents), [25, 25]);
});

test('random bonus position is immutable after first scoring', () => {
  const {
    db,
    getActiveSeasonId,
    upsertEventResults,
    scoreEvent,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  const event = db.prepare("SELECT id FROM events WHERE season_id = ? ORDER BY round_number LIMIT 1").get(seasonId);
  db.prepare('UPDATE events SET lock_at = ? WHERE id = ?').run('2000-01-01T00:00:00Z', event.id);

  const p1 = db.prepare("INSERT INTO participants (name, color, session_token) VALUES ('Cora', '#73d13d', 'tok-c')").run().lastInsertRowid;
  db.prepare('INSERT INTO season_participants (season_id, participant_id) VALUES (?, ?)').run(seasonId, p1);

  const d1 = db.prepare('SELECT id, external_id FROM drivers WHERE season_id = ? ORDER BY external_id LIMIT 1').get(seasonId);
  db.prepare('INSERT INTO ownership (season_id, driver_id, participant_id, purchase_price_cents) VALUES (?, ?, ?, ?)').run(seasonId, d1.id, p1, 10000);

  upsertEventResults({
    seasonId,
    eventId: event.id,
    rows: [{ external_driver_id: d1.external_id, finish_position: 1, start_position: 1 }],
  });
  scoreEvent({ seasonId, eventId: event.id });

  const firstDraw = db.prepare('SELECT random_bonus_position FROM events WHERE id = ?').get(event.id).random_bonus_position;
  assert.ok(firstDraw >= 4 && firstDraw <= 20);

  upsertEventResults({
    seasonId,
    eventId: event.id,
    rows: [{ external_driver_id: d1.external_id, finish_position: 2, start_position: 5 }],
  });
  scoreEvent({ seasonId, eventId: event.id });

  const secondDraw = db.prepare('SELECT random_bonus_position FROM events WHERE id = ?').get(event.id).random_bonus_position;
  assert.equal(secondDraw, firstDraw);
});

test('auction lifecycle sells driver and records ownership', () => {
  const {
    db,
    getActiveSeasonId,
    createAuctionService,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  const participantId = db.prepare("INSERT INTO participants (name, color, session_token) VALUES ('Dana', '#9254de', 'tok-d')").run().lastInsertRowid;
  db.prepare('INSERT INTO season_participants (season_id, participant_id) VALUES (?, ?)').run(seasonId, participantId);

  const io = { emit: () => {} };
  const auction = createAuctionService(io, {
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => {},
  });

  const start = auction.startAuction({ seasonId });
  assert.equal(start.ok, true);

  const participant = db.prepare('SELECT * FROM participants WHERE id = ?').get(participantId);
  const bid = auction.placeBid({ participant, amountCents: 3200 });
  assert.equal(bid.ok, true);

  const close = auction.closeActiveAuction({ seasonId });
  assert.equal(close.ok, true);

  const soldCount = db.prepare("SELECT COUNT(*) as c FROM auction_items WHERE season_id = ? AND status = 'sold'").get(seasonId).c;
  assert.equal(soldCount, 1);

  const ownershipCount = db.prepare('SELECT COUNT(*) as c FROM ownership WHERE season_id = ?').get(seasonId).c;
  assert.equal(ownershipCount, 1);
});

test('random bonus draw ranges follow payout model v2 bounds by event type', () => {
  const {
    db,
    getActiveSeasonId,
    upsertEventResults,
    scoreEvent,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  const gpEvent = db.prepare(`
    SELECT id
    FROM events
    WHERE season_id = ? AND type = 'grand_prix'
    ORDER BY round_number ASC
    LIMIT 1
  `).get(seasonId);
  const sprintEvent = db.prepare(`
    SELECT id
    FROM events
    WHERE season_id = ? AND type = 'sprint'
    ORDER BY round_number ASC
    LIMIT 1
  `).get(seasonId);
  const driver = db.prepare('SELECT id, external_id FROM drivers WHERE season_id = ? ORDER BY external_id ASC LIMIT 1').get(seasonId);

  db.prepare('UPDATE events SET lock_at = ? WHERE id IN (?, ?)').run('2000-01-01T00:00:00Z', gpEvent.id, sprintEvent.id);

  upsertEventResults({
    seasonId,
    eventId: gpEvent.id,
    rows: [{ external_driver_id: driver.external_id, finish_position: 1, start_position: 10 }],
  });
  const gpScore = scoreEvent({ seasonId, eventId: gpEvent.id });
  assert.equal(gpScore.ok, true);

  upsertEventResults({
    seasonId,
    eventId: sprintEvent.id,
    rows: [{ external_driver_id: driver.external_id, finish_position: 1, start_position: 8 }],
  });
  const sprintScore = scoreEvent({ seasonId, eventId: sprintEvent.id });
  assert.equal(sprintScore.ok, true);

  const gpDraw = db.prepare('SELECT random_bonus_position FROM events WHERE id = ?').get(gpEvent.id).random_bonus_position;
  const sprintDraw = db.prepare('SELECT random_bonus_position FROM events WHERE id = ?').get(sprintEvent.id).random_bonus_position;
  assert.ok(gpDraw >= 4 && gpDraw <= 20);
  assert.ok(sprintDraw >= 4 && sprintDraw <= 20);
});

test('season bonus winners and allocations follow payout model v2', () => {
  const {
    db,
    getActiveSeasonId,
    upsertEventResults,
    scoreEvent,
    recalcSeasonBonuses,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  const drivers = db.prepare(`
    SELECT id, external_id
    FROM drivers
    WHERE season_id = ?
    ORDER BY external_id ASC
    LIMIT 5
  `).all(seasonId);
  const [d1, d2, d3, d4, d5] = drivers;

  const participants = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'].map((name, idx) => (
    db.prepare('INSERT INTO participants (name, color, session_token) VALUES (?, ?, ?)').run(
      `${name}-${Date.now()}-${idx}`,
      `#00${idx + 1}ff`,
      `tok-${name.toLowerCase()}-${Date.now()}-${idx}`
    ).lastInsertRowid
  ));

  participants.forEach((participantId, idx) => {
    db.prepare('INSERT INTO season_participants (season_id, participant_id) VALUES (?, ?)').run(seasonId, participantId);
    db.prepare(`
      INSERT INTO ownership (season_id, driver_id, participant_id, purchase_price_cents)
      VALUES (?, ?, ?, ?)
    `).run(seasonId, drivers[idx].id, participantId, 10000);
  });

  const [gp1, gp2] = db.prepare(`
    SELECT id
    FROM events
    WHERE season_id = ? AND type = 'grand_prix'
    ORDER BY round_number ASC
    LIMIT 2
  `).all(seasonId);
  const sprint1 = db.prepare(`
    SELECT id
    FROM events
    WHERE season_id = ? AND type = 'sprint'
    ORDER BY round_number ASC
    LIMIT 1
  `).get(seasonId);

  db.prepare('UPDATE events SET lock_at = ? WHERE id IN (?, ?, ?)').run(
    '2000-01-01T00:00:00Z',
    gp1.id,
    gp2.id,
    sprint1.id
  );

  upsertEventResults({
    seasonId,
    eventId: gp1.id,
    rows: [
      { external_driver_id: d1.external_id, finish_position: 1, start_position: 3 },
      { external_driver_id: d2.external_id, finish_position: 2, start_position: 1 },
      { external_driver_id: d3.external_id, finish_position: 3, start_position: 8 },
      { external_driver_id: d4.external_id, finish_position: 4, start_position: 10 },
      { external_driver_id: d5.external_id, finish_position: 5, start_position: 4 },
    ],
  });
  upsertEventResults({
    seasonId,
    eventId: sprint1.id,
    rows: [
      { external_driver_id: d2.external_id, finish_position: 1, start_position: 2 },
      { external_driver_id: d3.external_id, finish_position: 2, start_position: 6 },
      { external_driver_id: d4.external_id, finish_position: 9, start_position: 15 },
      { external_driver_id: d5.external_id, finish_position: 10, start_position: 5 },
      { external_driver_id: d1.external_id, finish_position: 12, start_position: 1 },
    ],
  });
  upsertEventResults({
    seasonId,
    eventId: gp2.id,
    rows: [
      { external_driver_id: d2.external_id, finish_position: 1, start_position: 4 },
      { external_driver_id: d1.external_id, finish_position: 2, start_position: 1 },
      { external_driver_id: d3.external_id, finish_position: 8, start_position: 12 },
      { external_driver_id: d4.external_id, finish_position: 11, start_position: 20 },
      { external_driver_id: d5.external_id, finish_position: 10, start_position: 6 },
    ],
  });

  assert.equal(scoreEvent({ seasonId, eventId: gp1.id }).ok, true);
  assert.equal(scoreEvent({ seasonId, eventId: sprint1.id }).ok, true);
  assert.equal(scoreEvent({ seasonId, eventId: gp2.id }).ok, true);

  db.prepare(`
    UPDATE seasons
    SET season_random_bonus_position = ?, season_random_bonus_drawn_at = ?
    WHERE id = ?
  `).run(5, 1234567890, seasonId);

  const recalc = recalcSeasonBonuses({ seasonId });
  assert.equal(recalc.ok, true);

  const payouts = db.prepare(`
    SELECT category, driver_id, amount_cents, tie_count
    FROM season_bonus_payouts
    WHERE season_id = ?
    ORDER BY category ASC, driver_id ASC
  `).all(seasonId);

  const byCategory = payouts.reduce((acc, row) => {
    acc[row.category] = acc[row.category] || [];
    acc[row.category].push(row);
    return acc;
  }, {});

  assert.deepEqual(byCategory.drivers_champion.map((row) => [row.driver_id, row.amount_cents]), [[d2.id, 750]]);
  assert.deepEqual(byCategory.most_race_wins.map((row) => [row.driver_id, row.amount_cents]), [[d1.id, 250], [d2.id, 250]]);
  assert.deepEqual(byCategory.most_top10_outside_top4.map((row) => [row.driver_id, row.amount_cents]), [[d5.id, 750]]);
  assert.deepEqual(byCategory.season_random_finish_position.map((row) => [row.driver_id, row.amount_cents]), [[d5.id, 1000]]);
  assert.deepEqual(byCategory.biggest_single_race_climb.map((row) => [row.driver_id, row.amount_cents]), [[d4.id, 500]]);

  const season = db.prepare(`
    SELECT season_random_bonus_position, season_random_bonus_drawn_at
    FROM seasons
    WHERE id = ?
  `).get(seasonId);
  assert.equal(season.season_random_bonus_position, 5);
  assert.equal(season.season_random_bonus_drawn_at, 1234567890);
});

test('v2 migration normalizes rules and gp random draws for active season', () => {
  const modules = setupDb();
  const {
    db,
    getActiveSeasonId,
    init,
  } = modules;

  const seasonId = getActiveSeasonId();
  const gpEvent = db.prepare(`
    SELECT id
    FROM events
    WHERE season_id = ? AND type = 'grand_prix'
    ORDER BY round_number ASC
    LIMIT 1
  `).get(seasonId);

  db.prepare(`
    INSERT OR IGNORE INTO season_bonus_rules
      (season_id, category, label, bps, rank_order, active)
    VALUES (?, 'most_podiums', 'Most Podiums', 200, 90, 1)
  `).run(seasonId);
  db.prepare(`
    INSERT OR IGNORE INTO season_bonus_rules
      (season_id, category, label, bps, rank_order, active)
    VALUES (?, 'best_avg_finish', 'Best Avg Finish', 200, 91, 1)
  `).run(seasonId);
  db.prepare(`
    UPDATE season_bonus_rules
    SET active = 1, bps = 200
    WHERE season_id = ? AND category IN ('most_podiums', 'best_avg_finish')
  `).run(seasonId);

  db.prepare(`
    UPDATE seasons
    SET payout_model_version = 1
    WHERE id = ?
  `).run(seasonId);
  db.prepare(`
    UPDATE events
    SET status = 'scored', random_bonus_position = 2
    WHERE id = ?
  `).run(gpEvent.id);

  const rerun = init();
  assert.equal(rerun.payoutModelMigrated, true);

  const version = db.prepare('SELECT payout_model_version FROM seasons WHERE id = ?').get(seasonId).payout_model_version;
  assert.equal(version, 2);

  const deprecatedActive = db.prepare(`
    SELECT COUNT(*) as count
    FROM season_bonus_rules
    WHERE season_id = ?
      AND category IN ('most_podiums', 'best_avg_finish')
      AND active = 1
  `).get(seasonId).count;
  assert.equal(deprecatedActive, 0);

  const seasonCategories = db.prepare(`
    SELECT category
    FROM season_bonus_rules
    WHERE season_id = ? AND active = 1
    ORDER BY rank_order ASC
  `).all(seasonId).map((row) => row.category);
  assert.deepEqual(seasonCategories, [
    'drivers_champion',
    'most_race_wins',
    'most_top10_outside_top4',
    'season_random_finish_position',
    'biggest_single_race_climb',
  ]);

  const gpDraw = db.prepare('SELECT random_bonus_position FROM events WHERE id = ?').get(gpEvent.id).random_bonus_position;
  assert.ok(gpDraw >= 4 && gpDraw <= 20);
});
