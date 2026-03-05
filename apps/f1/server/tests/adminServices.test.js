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
  const resultsAdminService = require('../services/admin/resultsAdminService');
  const payoutRulesAdminService = require('../services/admin/payoutRulesAdminService');
  return { ...dbModule, resultsAdminService, payoutRulesAdminService };
}

function setupDb() {
  process.env.DB_PATH = path.join(
    os.tmpdir(),
    `f1-calcutta-admin-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`,
  );
  const modules = freshModules();
  modules.init();
  return modules;
}

test('results admin syncNext maps force flag to includeFuture/ignoreLock behavior', async () => {
  const {
    db,
    getActiveSeasonId,
    resultsAdminService,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  db.prepare(`
    UPDATE events
    SET starts_at = '2999-01-01T00:00:00Z',
        lock_at = '2999-01-01T00:00:00Z',
        status = 'pending'
    WHERE season_id = ?
  `).run(seasonId);

  const provider = {
    async fetchEventResults({ drivers }) {
      return [{
        external_driver_id: drivers[0].external_id,
        finish_position: 1,
        start_position: 1,
      }];
    },
  };

  const noForce = await resultsAdminService.syncNextResults({
    seasonId,
    provider,
    io: null,
    force: false,
  });
  assert.equal(noForce.ok, false);
  assert.equal(noForce.status, 404);

  const forced = await resultsAdminService.syncNextResults({
    seasonId,
    provider,
    io: null,
    force: true,
  });
  assert.equal(forced.ok, true);
  assert.equal(forced.rowCount, 1);
});

test('results admin manual save forces scoring path and persists results', () => {
  const {
    db,
    getActiveSeasonId,
    resultsAdminService,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  const event = db.prepare('SELECT id FROM events WHERE season_id = ? ORDER BY round_number ASC LIMIT 1').get(seasonId);
  const driver = db.prepare('SELECT id FROM drivers WHERE season_id = ? ORDER BY external_id ASC LIMIT 1').get(seasonId);

  db.prepare('UPDATE events SET lock_at = ? WHERE id = ?').run('2999-01-01T00:00:00Z', event.id);

  const result = resultsAdminService.saveManualResultsAndScore({
    seasonId,
    eventId: event.id,
    rows: [{ driver_id: driver.id, finish_position: 1, start_position: 3 }],
    force: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.rowCount, 1);

  const status = db.prepare('SELECT status FROM events WHERE id = ?').get(event.id)?.status;
  assert.equal(status, 'scored');

  const rowCount = db.prepare('SELECT COUNT(*) as c FROM event_results WHERE event_id = ?').get(event.id).c;
  assert.equal(rowCount, 1);
});

test('payout rules admin save triggers bonus recalc path and standings update emit', () => {
  const {
    db,
    getActiveSeasonId,
    getEventPayoutRules,
    getSeasonBonusRules,
    payoutRulesAdminService,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  const participantId = db.prepare(`
    INSERT INTO participants (name, color, session_token)
    VALUES ('Rules Tester', '#40a9ff', 'rules-test-token')
  `).run().lastInsertRowid;

  db.prepare(`
    INSERT INTO season_bonus_payouts
      (season_id, participant_id, driver_id, category, amount_cents, tie_count)
    VALUES (?, ?, NULL, 'dummy_category', 4321, 1)
  `).run(seasonId, participantId);

  const eventsRulesPayload = {
    grand_prix: getEventPayoutRules(seasonId, 'grand_prix'),
    sprint: getEventPayoutRules(seasonId, 'sprint'),
    season_bonus: getSeasonBonusRules(seasonId),
  };

  const emitted = [];
  const io = { emit: (eventName) => emitted.push(eventName) };

  const result = payoutRulesAdminService.savePayoutRulesForSeason({
    seasonId,
    payload: eventsRulesPayload,
    io,
  });

  assert.equal(result.ok, true);
  assert.ok(emitted.includes('standings:update'));

  const dummyCount = db.prepare(`
    SELECT COUNT(*) as c
    FROM season_bonus_payouts
    WHERE season_id = ? AND category = 'dummy_category'
  `).get(seasonId).c;
  assert.equal(dummyCount, 0);
});
