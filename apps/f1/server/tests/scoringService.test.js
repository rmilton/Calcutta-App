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
  assert.ok(firstDraw >= 1 && firstDraw <= 20);

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
