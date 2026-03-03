const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeIoMock() {
  const events = [];
  return {
    events,
    emit(name, payload) {
      events.push({ name, payload });
    },
    findAll(name) {
      return events.filter((e) => e.name === name);
    },
  };
}

let tmpDir;
let dbPath;
let dbModule;
let db;
let createAuctionService;
let tid;

function createParticipant(name, color) {
  const id = db.prepare(
    'INSERT INTO participants (name, color, is_admin, session_token) VALUES (?, ?, 0, ?)'
  ).run(name, color, `${name}-token`).lastInsertRowid;
  db.prepare('INSERT OR IGNORE INTO tournament_participants (tournament_id, participant_id) VALUES (?, ?)').run(tid, id);
  return id;
}

function firstPendingAuctionItem() {
  return db.prepare(
    "SELECT * FROM auction_items WHERE tournament_id = ? AND status = 'pending' ORDER BY queue_order LIMIT 1"
  ).get(tid);
}

test.before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calcutta-auction-test-'));
  dbPath = path.join(tmpDir, 'test.db');
  process.env.DB_PATH = dbPath;

  // Ensure fresh module singletons point to the test DB path.
  delete require.cache[require.resolve('../db')];
  delete require.cache[require.resolve('../services/auctionService')];

  dbModule = require('../db');
  ({ createAuctionService } = require('../services/auctionService'));
  dbModule.init();
  db = dbModule.db;
  tid = dbModule.getActiveTournamentId();
});

test.after(() => {
  try {
    db.close();
  } catch {
    // ignore cleanup errors
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('startAuction activates a pending item and emits auction:started', () => {
  const io = makeIoMock();
  const service = createAuctionService(io, { autoAdvanceDelayMs: 5 });
  const pending = firstPendingAuctionItem();

  const result = service.startAuction({ tid });
  assert.equal(result.ok, true);
  assert.equal(result.teamId, pending.team_id);

  const active = db.prepare(
    "SELECT * FROM auction_items WHERE id = ? AND tournament_id = ?"
  ).get(result.itemId, tid);
  assert.equal(active.status, 'active');
  assert.ok(active.bid_end_time > Date.now());

  const startedEvents = io.findAll('auction:started');
  assert.equal(startedEvents.length, 1);
  assert.equal(startedEvents[0].payload.itemId, result.itemId);

  service.closeActiveAuction({ tid });
});

test('placeBid + closeActiveAuction sells item and emits update/sold', () => {
  const io = makeIoMock();
  const service = createAuctionService(io, { autoAdvanceDelayMs: 5 });
  const participantId = createParticipant('Bidder One', '#00aa88');
  const participant = { id: participantId, name: 'Bidder One', color: '#00aa88', is_admin: 0 };

  const started = service.startAuction({ tid });
  assert.equal(started.ok, true);

  const bidRes = service.placeBid({ participant, amount: 12 });
  assert.equal(bidRes.ok, true);

  const activeAfterBid = db.prepare('SELECT * FROM auction_items WHERE id = ?').get(started.itemId);
  assert.equal(activeAfterBid.current_price, 12);
  assert.equal(activeAfterBid.current_leader_id, participantId);

  const closeRes = service.closeActiveAuction({ tid });
  assert.equal(closeRes.ok, true);

  const soldRow = db.prepare('SELECT * FROM auction_items WHERE id = ?').get(started.itemId);
  assert.equal(soldRow.status, 'sold');
  assert.equal(soldRow.winner_id, participantId);
  assert.equal(soldRow.final_price, 12);

  const ownership = db.prepare(
    'SELECT * FROM ownership WHERE tournament_id = ? AND team_id = ?'
  ).get(tid, soldRow.team_id);
  assert.ok(ownership);
  assert.equal(ownership.participant_id, participantId);
  assert.equal(ownership.purchase_price, 12);

  assert.ok(io.findAll('auction:update').length >= 1);
  assert.ok(io.findAll('auction:sold').length >= 1);
});

test('closeActiveAuction with no bids re-queues item and emits auction:nobids', () => {
  const io = makeIoMock();
  const service = createAuctionService(io, { autoAdvanceDelayMs: 5 });

  const started = service.startAuction({ tid });
  assert.equal(started.ok, true);

  const closeRes = service.closeActiveAuction({ tid });
  assert.equal(closeRes.ok, true);

  const row = db.prepare('SELECT * FROM auction_items WHERE id = ?').get(started.itemId);
  assert.equal(row.status, 'pending');
  assert.equal(row.current_price, 0);
  assert.equal(row.current_leader_id, null);
  assert.equal(row.bid_end_time, null);

  const noBidEvents = io.findAll('auction:nobids');
  assert.equal(noBidEvents.length, 1);
  assert.equal(noBidEvents[0].payload.itemId, started.itemId);
});

test('auto-advance starts next item after a successful sale when enabled', async () => {
  const io = makeIoMock();
  const service = createAuctionService(io, { autoAdvanceDelayMs: 5 });
  const participantId = createParticipant('Bidder Two', '#3355ff');
  const participant = { id: participantId, name: 'Bidder Two', color: '#3355ff', is_admin: 0 };

  db.prepare("UPDATE tournaments SET auction_auto_advance = 1, auction_status = 'open' WHERE id = ?").run(tid);

  const started = service.startAuction({ tid });
  assert.equal(started.ok, true);
  const firstItemId = started.itemId;

  const bidRes = service.placeBid({ participant, amount: 25 });
  assert.equal(bidRes.ok, true);
  service.closeActiveAuction({ tid });

  await wait(40);

  const active = db.prepare(
    "SELECT * FROM auction_items WHERE tournament_id = ? AND status = 'active' LIMIT 1"
  ).get(tid);
  assert.ok(active);
  assert.notEqual(active.id, firstItemId);

  const startedEvents = io.findAll('auction:started');
  assert.ok(startedEvents.length >= 2);

  service.closeActiveAuction({ tid });
  db.prepare("UPDATE tournaments SET auction_auto_advance = 0 WHERE id = ?").run(tid);
});
