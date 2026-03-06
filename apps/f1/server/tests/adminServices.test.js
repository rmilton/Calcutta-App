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
  const auctionAdminService = require('../services/admin/auctionAdminService');
  return { ...dbModule, resultsAdminService, payoutRulesAdminService, auctionAdminService };
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
    getProviderSyncStates,
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
    getProviderSyncStates,
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

test('results admin refreshDrivers updates seeded drivers without changing identities', async () => {
  const {
    db,
    getActiveSeasonId,
    getProviderSyncStates,
    resultsAdminService,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  const before = db.prepare(`
    SELECT id, name, code, external_id, team_name
    FROM drivers
    WHERE season_id = ? AND code = 'PER'
  `).get(seasonId);

  const provider = {
    name: 'openf1',
    async fetchDrivers() {
      return [
        { external_id: 1, code: 'VER', name: 'Max Verstappen', team_name: 'Oracle Red Bull Racing' },
        { external_id: 11, code: 'PER', name: 'Sergio Perez', team_name: 'Oracle Red Bull Racing' },
        { external_id: 16, code: 'LEC', name: 'Charles Leclerc', team_name: 'Scuderia Ferrari' },
        { external_id: 44, code: 'HAM', name: 'Lewis Hamilton', team_name: 'Scuderia Ferrari' },
        { external_id: 4, code: 'NOR', name: 'Lando Norris', team_name: 'McLaren Formula 1 Team' },
        { external_id: 81, code: 'PIA', name: 'Oscar Piastri', team_name: 'McLaren Formula 1 Team' },
        { external_id: 63, code: 'RUS', name: 'George Russell', team_name: 'Mercedes-AMG PETRONAS' },
        { external_id: 12, code: 'ANT', name: 'Andrea Kimi Antonelli', team_name: 'Mercedes-AMG PETRONAS' },
        { external_id: 14, code: 'ALO', name: 'Fernando Alonso', team_name: 'Aston Martin Aramco' },
        { external_id: 18, code: 'STR', name: 'Lance Stroll', team_name: 'Aston Martin Aramco' },
        { external_id: 10, code: 'GAS', name: 'Pierre Gasly', team_name: 'BWT Alpine F1 Team' },
        { external_id: 7, code: 'DOO', name: 'Jack Doohan', team_name: 'BWT Alpine F1 Team' },
        { external_id: 23, code: 'ALB', name: 'Alex Albon', team_name: 'Williams Racing' },
        { external_id: 55, code: 'SAI', name: 'Carlos Sainz', team_name: 'Williams Racing' },
        { external_id: 27, code: 'HUL', name: 'Nico Hulkenberg', team_name: 'Stake F1 Team Kick Sauber' },
        { external_id: 5, code: 'BOR', name: 'Gabriel Bortoleto', team_name: 'Stake F1 Team Kick Sauber' },
        { external_id: 22, code: 'TSU', name: 'Yuki Tsunoda', team_name: 'Visa Cash App Racing Bulls' },
        { external_id: 30, code: 'LAW', name: 'Liam Lawson', team_name: 'Visa Cash App Racing Bulls' },
        { external_id: 31, code: 'OCO', name: 'Esteban Ocon', team_name: 'MoneyGram Haas F1 Team' },
        { external_id: 87, code: 'BEA', name: 'Oliver Bearman', team_name: 'MoneyGram Haas F1 Team' },
      ];
    },
  };

  const result = await resultsAdminService.refreshDriversFromProvider({
    seasonId,
    provider,
  });

  assert.equal(result.ok, true);
  assert.equal(result.count, 20);

  const after = db.prepare(`
    SELECT id, name, code, external_id, team_name
    FROM drivers
    WHERE season_id = ? AND code = 'PER'
  `).get(seasonId);

  assert.equal(after.id, before.id);
  assert.notEqual(after.external_id, before.external_id);
  assert.equal(after.external_id, 11);
  assert.equal(after.team_name, 'Oracle Red Bull Racing');

  const driverState = getProviderSyncStates(seasonId).find((row) => row.scope === 'drivers');
  const driverMeta = JSON.parse(driverState.meta_json);
  assert.equal(driverMeta.drivers.length, 20);
  assert.deepEqual(driverMeta.drivers[0], {
    external_id: 1,
    code: 'VER',
    name: 'Max Verstappen',
    team_name: 'Oracle Red Bull Racing',
  });
});

test('results admin refreshDrivers rebuilds clean season roster when provider lineup drifts from the seed', async () => {
  const {
    db,
    getActiveSeasonId,
    getProviderSyncStates,
    resultsAdminService,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  const provider = {
    name: 'openf1',
    async fetchDrivers() {
      return [
        { external_id: 1, code: 'VER', name: 'Max Verstappen', team_name: 'Red Bull Racing' },
        { external_id: 81, code: 'PIA', name: 'Oscar Piastri', team_name: 'McLaren' },
        { external_id: 43, code: 'LIN', name: 'Arvid Lindblad', team_name: 'Cadillac' },
      ];
    },
  };

  const result = await resultsAdminService.refreshDriversFromProvider({
    seasonId,
    provider,
  });

  assert.equal(result.ok, true);
  assert.equal(result.count, 3);

  const drivers = db.prepare(`
    SELECT code, name, team_name, external_id
    FROM drivers
    WHERE season_id = ?
    ORDER BY id ASC
  `).all(seasonId);
  assert.equal(drivers.length, 3);
  assert.deepEqual(drivers[2], {
    code: 'LIN',
    name: 'Arvid Lindblad',
    team_name: 'Cadillac',
    external_id: 43,
  });
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM auction_items WHERE season_id = ?').get(seasonId).c, 3);

  const driverState = getProviderSyncStates(seasonId).find((row) => row.scope === 'drivers');
  const driverMeta = JSON.parse(driverState.meta_json);
  assert.equal(driverState.status, 'success');
  assert.equal(driverMeta.source, 'authoritative-rebuild');
  assert.equal(driverMeta.drivers.length, 3);
});

test('results admin refreshDrivers still fails closed on roster drift after season activity exists', async () => {
  const {
    db,
    getActiveSeasonId,
    getProviderSyncStates,
    resultsAdminService,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  const participantId = db.prepare(`
    INSERT INTO participants (name, color, session_token)
    VALUES ('Refresh Lock Tester', '#ffffff', 'refresh-lock-token')
  `).run().lastInsertRowid;
  db.prepare('INSERT INTO season_participants (season_id, participant_id) VALUES (?, ?)').run(seasonId, participantId);

  const driver = db.prepare('SELECT id FROM drivers WHERE season_id = ? ORDER BY id ASC LIMIT 1').get(seasonId);
  db.prepare(`
    INSERT INTO ownership (season_id, driver_id, participant_id, purchase_price_cents)
    VALUES (?, ?, ?, ?)
  `).run(seasonId, driver.id, participantId, 500);

  const provider = {
    name: 'openf1',
    async fetchDrivers() {
      return [
        { external_id: 1, code: 'VER', name: 'Max Verstappen', team_name: 'Red Bull Racing' },
        { external_id: 43, code: 'LIN', name: 'Arvid Lindblad', team_name: 'Cadillac' },
      ];
    },
  };

  const result = await resultsAdminService.refreshDriversFromProvider({
    seasonId,
    provider,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);

  const driverState = getProviderSyncStates(seasonId).find((row) => row.scope === 'drivers');
  const driverMeta = JSON.parse(driverState.meta_json);
  assert.equal(driverState.status, 'error');
  assert.equal(driverMeta.seasonActivity.ownership, 1);
});

test('results admin refreshSchedule updates matching seeded events with provider keys', async () => {
  const {
    db,
    getActiveSeasonId,
    resultsAdminService,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  const provider = {
    name: 'openf1',
    async fetchSeasonSchedule() {
      return [
        {
          external_event_id: '9001',
          round_number: 1,
          name: 'Australian Grand Prix',
          type: 'grand_prix',
          starts_at: '2026-02-22T04:00:00.000Z',
          lock_at: '2026-02-22T03:50:00.000Z',
        },
        {
          external_event_id: '9002',
          round_number: 2,
          name: 'Chinese Grand Prix (Sprint)',
          type: 'sprint',
          starts_at: '2026-03-01T03:00:00.000Z',
          lock_at: '2026-03-01T02:50:00.000Z',
        },
      ];
    },
  };

  const result = await resultsAdminService.refreshScheduleFromProvider({
    seasonId,
    provider,
  });

  assert.equal(result.ok, true);
  assert.equal(result.count, 2);

  const australianGp = db.prepare(`
    SELECT external_event_id
    FROM events
    WHERE season_id = ? AND round_number = 1 AND type = 'grand_prix'
  `).get(seasonId);

  const chineseSprint = db.prepare(`
    SELECT external_event_id
    FROM events
    WHERE season_id = ? AND round_number = 2 AND type = 'sprint'
  `).get(seasonId);

  assert.equal(australianGp.external_event_id, '9001');
  assert.equal(chineseSprint.external_event_id, '9002');
});

test('results admin refreshSchedule matches by round and type when provider names differ', async () => {
  const {
    db,
    getActiveSeasonId,
    resultsAdminService,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  const provider = {
    name: 'openf1',
    async fetchSeasonSchedule() {
      return [
        {
          external_event_id: '9901',
          round_number: 1,
          name: 'FORMULA 1 LOUIS VUITTON AUSTRALIAN GRAND PRIX 2026',
          type: 'grand_prix',
          starts_at: '2026-02-22T04:00:00.000Z',
          lock_at: '2026-02-22T03:50:00.000Z',
        },
      ];
    },
  };

  const result = await resultsAdminService.refreshScheduleFromProvider({
    seasonId,
    provider,
  });

  assert.equal(result.ok, true);
  assert.equal(result.count, 1);

  const australianGp = db.prepare(`
    SELECT external_event_id, name
    FROM events
    WHERE season_id = ? AND round_number = 1 AND type = 'grand_prix'
  `).get(seasonId);

  assert.equal(australianGp.external_event_id, '9901');
  assert.equal(australianGp.name, 'FORMULA 1 LOUIS VUITTON AUSTRALIAN GRAND PRIX 2026');
});

test('auction admin shufflePendingAuctionQueue reorders pending drivers only', () => {
  const {
    db,
    getActiveSeasonId,
    auctionAdminService,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  const before = db.prepare(`
    SELECT id, queue_order, status
    FROM auction_items
    WHERE season_id = ?
    ORDER BY queue_order ASC, id ASC
    LIMIT 5
  `).all(seasonId);

  db.prepare(`
    UPDATE auction_items
    SET status = 'sold'
    WHERE id = ?
  `).run(before[0].id);

  const result = auctionAdminService.shufflePendingAuctionQueue({
    seasonId,
    shuffle: (items) => [...items].reverse(),
  });
  assert.equal(result.ok, true);
  assert.ok(result.shuffledCount > 0);

  const sold = db.prepare('SELECT queue_order, status FROM auction_items WHERE id = ?').get(before[0].id);
  assert.equal(sold.status, 'sold');
  assert.equal(sold.queue_order, before[0].queue_order);

  const pending = db.prepare(`
    SELECT id, queue_order
    FROM auction_items
    WHERE season_id = ? AND status = 'pending'
    ORDER BY queue_order ASC
    LIMIT 5
  `).all(seasonId);

  assert.deepEqual(pending.map((item) => item.queue_order), [0, 1, 2, 3, 4]);
  assert.notDeepEqual(
    pending.map((item) => item.id),
    before.slice(1).map((item) => item.id),
  );
});

test('results admin refreshSchedule inserts missing sprint-weekend grand prix rows', async () => {
  const {
    db,
    getActiveSeasonId,
    resultsAdminService,
  } = setupDb();

  const seasonId = getActiveSeasonId();

  const provider = {
    name: 'openf1',
    async fetchSeasonSchedule() {
      return [
        {
          external_event_id: '9002',
          round_number: 2,
          name: 'Chinese Grand Prix (Sprint)',
          type: 'sprint',
          starts_at: '2026-03-01T03:00:00.000Z',
          lock_at: '2026-03-01T02:50:00.000Z',
        },
        {
          external_event_id: '9003',
          round_number: 2,
          name: 'Chinese Grand Prix',
          type: 'grand_prix',
          starts_at: '2026-03-01T07:00:00.000Z',
          lock_at: '2026-03-01T06:50:00.000Z',
        },
      ];
    },
  };

  const result = await resultsAdminService.refreshScheduleFromProvider({
    seasonId,
    provider,
  });

  assert.equal(result.ok, true);
  assert.equal(result.insertedCount, 1);

  const chineseGp = db.prepare(`
    SELECT external_event_id, round_number, type, name
    FROM events
    WHERE season_id = ? AND round_number = 2 AND type = 'grand_prix'
  `).get(seasonId);

  assert.equal(chineseGp.external_event_id, '9003');
  assert.equal(chineseGp.name, 'Chinese Grand Prix');
});

test('results admin refreshSchedule removes stale unmatched pending events', async () => {
  const {
    db,
    getActiveSeasonId,
    resultsAdminService,
  } = setupDb();

  const seasonId = getActiveSeasonId();

  const provider = {
    name: 'openf1',
    async fetchSeasonSchedule() {
      return [
        {
          external_event_id: '9201',
          round_number: 1,
          name: 'Australian Grand Prix',
          type: 'grand_prix',
          starts_at: '2026-03-08T04:00:00.000Z',
          lock_at: '2026-03-08T03:50:00.000Z',
        },
      ];
    },
  };

  const before = db.prepare(`
    SELECT COUNT(*) as c
    FROM events
    WHERE season_id = ? AND round_number = 12 AND type = 'sprint'
  `).get(seasonId).c;

  const result = await resultsAdminService.refreshScheduleFromProvider({
    seasonId,
    provider,
  });

  assert.equal(result.ok, true);
  assert.ok(result.removedCount >= 1);

  const after = db.prepare(`
    SELECT COUNT(*) as c
    FROM events
    WHERE season_id = ? AND round_number = 12 AND type = 'sprint'
  `).get(seasonId).c;

  assert.equal(before, 1);
  assert.equal(after, 0);
});

test('results admin clearTestData resets season activity but preserves seeded setup', () => {
  const {
    db,
    getActiveSeasonId,
    resultsAdminService,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  const adminResult = db.prepare(`
    INSERT INTO participants (name, color, is_admin, session_token)
    VALUES ('Admin Tester', '#000000', 1, 'admin-token-1')
  `).run();
  const adminId = adminResult.lastInsertRowid;
  db.prepare('INSERT INTO season_participants (season_id, participant_id) VALUES (?, ?)').run(seasonId, adminId);
  const driver = db.prepare('SELECT id FROM drivers WHERE season_id = ? ORDER BY id ASC LIMIT 1').get(seasonId);
  const event = db.prepare('SELECT id FROM events WHERE season_id = ? ORDER BY id ASC LIMIT 1').get(seasonId);

  const participantResult = db.prepare(`
    INSERT INTO participants (name, color, is_admin, session_token)
    VALUES ('Tester', '#ffffff', 0, 'token-1')
  `).run();
  const participantId = participantResult.lastInsertRowid;

  db.prepare('INSERT INTO season_participants (season_id, participant_id) VALUES (?, ?)').run(seasonId, participantId);
  db.prepare(`
    INSERT INTO ownership (season_id, driver_id, participant_id, purchase_price_cents)
    VALUES (?, ?, ?, ?)
  `).run(seasonId, driver.id, participantId, 500);
  db.prepare(`
    INSERT INTO bids (season_id, driver_id, participant_id, amount_cents)
    VALUES (?, ?, ?, ?)
  `).run(seasonId, driver.id, participantId, 500);
  db.prepare(`
    INSERT INTO event_results (event_id, driver_id, finish_position, start_position, positions_gained, is_manual_override)
    VALUES (?, ?, 5, 10, 5, 1)
  `).run(event.id, driver.id);
  db.prepare(`
    INSERT INTO event_payouts (season_id, event_id, participant_id, driver_id, category, amount_cents, tie_count)
    VALUES (?, ?, ?, ?, 'race_winner', 100, 1)
  `).run(seasonId, event.id, participantId, driver.id);
  db.prepare(`
    INSERT INTO season_bonus_payouts (season_id, participant_id, driver_id, category, amount_cents, tie_count)
    VALUES (?, ?, ?, 'drivers_champion', 200, 1)
  `).run(seasonId, participantId, driver.id);
  db.prepare(`
    INSERT INTO provider_sync_state (season_id, scope, provider, status, message)
    VALUES (?, 'drivers', 'openf1', 'success', 'ok')
  `).run(seasonId);
  db.prepare(`
    UPDATE auction_items
    SET status = 'sold',
        current_price_cents = 500,
        current_leader_id = ?,
        bid_end_time = 123,
        final_price_cents = 500,
        winner_id = ?
    WHERE season_id = ? AND driver_id = ?
  `).run(participantId, participantId, seasonId, driver.id);
  db.prepare(`
    UPDATE events
    SET status = 'scored',
        random_bonus_position = 9,
        random_bonus_drawn_at = 123,
        synced_at = 123
    WHERE id = ?
  `).run(event.id);
  db.prepare(`
    UPDATE seasons
    SET auction_status = 'complete',
        season_random_bonus_position = 7,
        season_random_bonus_drawn_at = 123
    WHERE id = ?
  `).run(seasonId);

  const clearStateCalls = [];
  const result = resultsAdminService.clearTestDataForSeason({
    seasonId,
    io: null,
    auctionService: {
      clearActiveTimer() {
        clearStateCalls.push('cleared');
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(clearStateCalls.length, 1);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM ownership WHERE season_id = ?').get(seasonId).c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM bids WHERE season_id = ?').get(seasonId).c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM event_results WHERE event_id = ?').get(event.id).c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM event_payouts WHERE season_id = ?').get(seasonId).c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM season_bonus_payouts WHERE season_id = ?').get(seasonId).c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM provider_sync_state WHERE season_id = ?').get(seasonId).c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM season_participants WHERE season_id = ? AND participant_id = ?').get(seasonId, participantId).c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM participants WHERE id = ?').get(participantId).c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM participants WHERE id = ?').get(adminId).c, 1);

  const auctionItem = db.prepare(`
    SELECT status, current_price_cents, current_leader_id, bid_end_time, final_price_cents, winner_id
    FROM auction_items
    WHERE season_id = ? AND driver_id = ?
  `).get(seasonId, driver.id);
  assert.equal(auctionItem.status, 'pending');
  assert.equal(auctionItem.current_price_cents, 0);
  assert.equal(auctionItem.current_leader_id, null);
  assert.equal(auctionItem.bid_end_time, null);
  assert.equal(auctionItem.final_price_cents, null);
  assert.equal(auctionItem.winner_id, null);

  const eventAfter = db.prepare(`
    SELECT status, random_bonus_position, random_bonus_drawn_at, synced_at
    FROM events
    WHERE id = ?
  `).get(event.id);
  assert.equal(eventAfter.status, 'pending');
  assert.equal(eventAfter.random_bonus_position, null);
  assert.equal(eventAfter.random_bonus_drawn_at, null);
  assert.equal(eventAfter.synced_at, null);

  const seasonAfter = db.prepare(`
    SELECT auction_status, season_random_bonus_position, season_random_bonus_drawn_at
    FROM seasons
    WHERE id = ?
  `).get(seasonId);
  assert.equal(seasonAfter.auction_status, 'waiting');
  assert.equal(seasonAfter.season_random_bonus_position, null);
  assert.equal(seasonAfter.season_random_bonus_drawn_at, null);

  assert.equal(db.prepare('SELECT COUNT(*) as c FROM drivers WHERE season_id = ?').get(seasonId).c, 20);
  assert.ok(db.prepare('SELECT COUNT(*) as c FROM events WHERE season_id = ?').get(seasonId).c > 0);
});

test('results admin loadHistoricalSeasonMetadata replaces drivers and events with a historical dataset', async () => {
  const {
    db,
    getActiveSeasonId,
    resultsAdminService,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  const participantResult = db.prepare(`
    INSERT INTO participants (name, color, is_admin, session_token)
    VALUES ('Tester', '#ffffff', 0, 'token-historical')
  `).run();
  const participantId = participantResult.lastInsertRowid;
  db.prepare('INSERT INTO season_participants (season_id, participant_id) VALUES (?, ?)').run(seasonId, participantId);

  const provider = {
    name: 'openf1',
    async fetchDrivers({ year }) {
      assert.equal(year, 2025);
      return [
        { external_id: 81, code: 'PIA', name: 'Oscar Piastri', team_name: 'McLaren' },
        { external_id: 4, code: 'NOR', name: 'Lando Norris', team_name: 'McLaren' },
      ];
    },
    async fetchSeasonSchedule({ year }) {
      assert.equal(year, 2025);
      return [
        {
          external_event_id: '2025-1-gp',
          round_number: 1,
          name: 'Australian Grand Prix',
          type: 'grand_prix',
          starts_at: '2025-03-16T04:00:00.000Z',
          lock_at: '2025-03-16T03:50:00.000Z',
        },
        {
          external_event_id: '2025-2-sprint',
          round_number: 2,
          name: 'Chinese Grand Prix (Sprint)',
          type: 'sprint',
          starts_at: '2025-03-22T03:00:00.000Z',
          lock_at: '2025-03-22T02:50:00.000Z',
        },
        {
          external_event_id: '2025-2-gp',
          round_number: 2,
          name: 'Chinese Grand Prix',
          type: 'grand_prix',
          starts_at: '2025-03-23T07:00:00.000Z',
          lock_at: '2025-03-23T06:50:00.000Z',
        },
      ];
    },
  };

  const result = await resultsAdminService.loadHistoricalSeasonMetadata({
    seasonId,
    provider,
    year: 2025,
    io: null,
    auctionService: {
      clearActiveTimer() {},
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.driverCount, 2);
  assert.equal(result.eventCount, 3);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM drivers WHERE season_id = ?').get(seasonId).c, 2);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM auction_items WHERE season_id = ?').get(seasonId).c, 2);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM events WHERE season_id = ?').get(seasonId).c, 3);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM season_participants WHERE season_id = ? AND participant_id = ?').get(seasonId, participantId).c, 0);

  const firstDriver = db.prepare(`
    SELECT code, name, team_name
    FROM drivers
    WHERE season_id = ?
    ORDER BY id ASC
    LIMIT 1
  `).get(seasonId);
  assert.equal(firstDriver.code, 'PIA');
  assert.equal(firstDriver.name, 'Oscar Piastri');

  const loadedSprint = db.prepare(`
    SELECT external_event_id, name, type
    FROM events
    WHERE season_id = ? AND round_number = 2 AND type = 'sprint'
  `).get(seasonId);
  assert.equal(loadedSprint.external_event_id, '2025-2-sprint');
  assert.equal(loadedSprint.name, 'Chinese Grand Prix (Sprint)');
});

test('results admin rescoreSeasonEventsForSeason rewrites scored event payouts under current rules', () => {
  const {
    db,
    getActiveSeasonId,
    resultsAdminService,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  const event = db.prepare(`
    SELECT id
    FROM events
    WHERE season_id = ? AND type = 'grand_prix'
    ORDER BY round_number ASC
    LIMIT 1
  `).get(seasonId);
  const [d1, d2] = db.prepare(`
    SELECT id, external_id
    FROM drivers
    WHERE season_id = ?
    ORDER BY external_id ASC
    LIMIT 2
  `).all(seasonId);

  const participantId = db.prepare(`
    INSERT INTO participants (name, color, session_token)
    VALUES ('Rescore Tester', '#ffaa00', 'rescore-token')
  `).run().lastInsertRowid;
  db.prepare('INSERT INTO season_participants (season_id, participant_id) VALUES (?, ?)').run(seasonId, participantId);
  db.prepare(`
    INSERT INTO ownership (season_id, driver_id, participant_id, purchase_price_cents)
    VALUES (?, ?, ?, ?)
  `).run(seasonId, d2.id, participantId, 1000);

  db.prepare(`
    INSERT INTO event_results
      (event_id, driver_id, finish_position, start_position, positions_gained, slowest_pit_stop_seconds, is_manual_override)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(event.id, d1.id, 3, 2, -1, 2.111);
  db.prepare(`
    INSERT INTO event_results
      (event_id, driver_id, finish_position, start_position, positions_gained, slowest_pit_stop_seconds, is_manual_override)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(event.id, d2.id, 8, 7, -1, 7.456);
  db.prepare(`
    UPDATE events
    SET status = 'scored', lock_at = '2000-01-01T00:00:00Z'
    WHERE id = ?
  `).run(event.id);

  db.prepare(`
    INSERT INTO event_payouts (season_id, event_id, participant_id, driver_id, category, amount_cents, tie_count)
    VALUES (?, ?, ?, ?, 'second_most_positions_gained', 999, 1)
  `).run(seasonId, event.id, participantId, d2.id);

  const emitted = [];
  const result = resultsAdminService.rescoreSeasonEventsForSeason({
    seasonId,
    io: { emit: (eventName) => emitted.push(eventName) },
  });

  assert.equal(result.ok, true);
  assert.equal(result.rescoredEvents, 1);
  assert.ok(emitted.includes('standings:update'));

  const stalePayoutCount = db.prepare(`
    SELECT COUNT(*) as c
    FROM event_payouts
    WHERE season_id = ? AND event_id = ? AND category = 'second_most_positions_gained'
  `).get(seasonId, event.id).c;
  assert.equal(stalePayoutCount, 0);

  const newPayout = db.prepare(`
    SELECT participant_id, driver_id, category, amount_cents
    FROM event_payouts
    WHERE season_id = ? AND event_id = ? AND category = 'slowest_pit_stop'
  `).get(seasonId, event.id);
  assert.equal(newPayout.participant_id, participantId);
  assert.equal(newPayout.driver_id, d2.id);
  assert.equal(newPayout.amount_cents, 3);
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

test('results admin resetAuctionOnlyForSeason preserves participants and race data while clearing auction state', () => {
  const {
    db,
    getActiveSeasonId,
    resultsAdminService,
  } = setupDb();

  const seasonId = getActiveSeasonId();
  const participantId = db.prepare(`
    INSERT INTO participants (name, color, session_token)
    VALUES ('Auction Tester', '#ffffff', 'token-auction-reset')
  `).run().lastInsertRowid;
  db.prepare('INSERT INTO season_participants (season_id, participant_id) VALUES (?, ?)').run(seasonId, participantId);

  const driver = db.prepare('SELECT id FROM drivers WHERE season_id = ? ORDER BY id ASC LIMIT 1').get(seasonId);
  const event = db.prepare('SELECT id FROM events WHERE season_id = ? ORDER BY round_number ASC LIMIT 1').get(seasonId);

  db.prepare(`
    INSERT INTO ownership (season_id, driver_id, participant_id, purchase_price_cents)
    VALUES (?, ?, ?, ?)
  `).run(seasonId, driver.id, participantId, 500);
  db.prepare(`
    INSERT INTO bids (season_id, driver_id, participant_id, amount_cents)
    VALUES (?, ?, ?, ?)
  `).run(seasonId, driver.id, participantId, 500);
  db.prepare(`
    UPDATE auction_items
    SET status = 'sold',
        current_price_cents = 500,
        current_leader_id = ?,
        bid_end_time = 123,
        final_price_cents = 500,
        winner_id = ?,
        queue_order = 19
    WHERE season_id = ? AND driver_id = ?
  `).run(participantId, participantId, seasonId, driver.id);
  db.prepare(`UPDATE seasons SET auction_status = 'complete' WHERE id = ?`).run(seasonId);

  db.prepare(`UPDATE events SET status = 'scored' WHERE id = ?`).run(event.id);
  db.prepare(`
    INSERT INTO event_results (event_id, driver_id, finish_position, start_position, positions_gained, is_manual_override)
    VALUES (?, ?, 1, 3, 2, 1)
  `).run(event.id, driver.id);
  db.prepare(`
    INSERT INTO event_payouts (season_id, event_id, participant_id, driver_id, category, amount_cents, tie_count)
    VALUES (?, ?, ?, ?, 'race_winner', 103, 1)
  `).run(seasonId, event.id, participantId, driver.id);
  db.prepare(`
    INSERT INTO season_bonus_payouts (season_id, participant_id, driver_id, category, amount_cents, tie_count)
    VALUES (?, ?, ?, 'drivers_champion', 500, 1)
  `).run(seasonId, participantId, driver.id);

  const result = resultsAdminService.resetAuctionOnlyForSeason({
    seasonId,
    io: null,
    auctionService: { clearActiveTimer() {} },
    shuffle: (items) => [...items].reverse(),
  });

  assert.equal(result.ok, true);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM season_participants WHERE season_id = ? AND participant_id = ?').get(seasonId, participantId).c, 1);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM participants WHERE id = ?').get(participantId).c, 1);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM event_results WHERE event_id = ?').get(event.id).c, 1);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM event_payouts WHERE season_id = ?').get(seasonId).c, 1);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM season_bonus_payouts WHERE season_id = ?').get(seasonId).c, 1);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM ownership WHERE season_id = ?').get(seasonId).c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM bids WHERE season_id = ?').get(seasonId).c, 0);
  assert.equal(db.prepare('SELECT auction_status FROM seasons WHERE id = ?').get(seasonId).auction_status, 'waiting');

  const auctionItems = db.prepare(`
    SELECT status, current_price_cents, current_leader_id, bid_end_time, final_price_cents, winner_id, queue_order
    FROM auction_items
    WHERE season_id = ?
    ORDER BY queue_order ASC
  `).all(seasonId);

  assert.ok(auctionItems.length > 0);
  assert.ok(auctionItems.every((item) => item.status === 'pending'));
  assert.ok(auctionItems.every((item) => item.current_price_cents === 0));
  assert.ok(auctionItems.every((item) => item.current_leader_id == null));
  assert.ok(auctionItems.every((item) => item.bid_end_time == null));
  assert.ok(auctionItems.every((item) => item.final_price_cents == null));
  assert.ok(auctionItems.every((item) => item.winner_id == null));
  assert.deepEqual(auctionItems.map((item) => item.queue_order), auctionItems.map((_, idx) => idx));
});

test('results admin restoreSeededSeasonMetadata rebuilds canonical 2026 drivers and events', () => {
  const {
    db,
    getActiveSeasonId,
    resultsAdminService,
  } = setupDb();

  const seasonId = getActiveSeasonId();

  db.prepare(`
    INSERT INTO drivers (season_id, external_id, code, name, team_name, active)
    VALUES (?, 999, 'TST', 'Test Driver', 'Test Team', 1)
  `).run(seasonId);
  db.prepare(`
    INSERT INTO events (season_id, external_event_id, round_number, name, type, starts_at, lock_at)
    VALUES (?, 'test-event', 99, 'Test Event', 'grand_prix', '2026-01-01T00:00:00Z', '2025-12-31T23:50:00Z')
  `).run(seasonId);

  const participantId = db.prepare(`
    INSERT INTO participants (name, color, session_token)
    VALUES ('Restore Tester', '#ffffff', 'restore-token')
  `).run().lastInsertRowid;
  db.prepare('INSERT INTO season_participants (season_id, participant_id) VALUES (?, ?)').run(seasonId, participantId);

  const result = resultsAdminService.restoreSeededSeasonMetadata({
    seasonId,
    io: null,
    auctionService: { clearActiveTimer() {} },
  });

  assert.equal(result.ok, true);
  assert.equal(result.driverCount, 20);
  assert.equal(result.eventCount, 24);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM drivers WHERE season_id = ?').get(seasonId).c, 20);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM events WHERE season_id = ?').get(seasonId).c, 24);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM auction_items WHERE season_id = ?').get(seasonId).c, 20);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM season_participants WHERE season_id = ?').get(seasonId).c, 0);

  const restoredDriver = db.prepare(`
    SELECT code, name, team_name, external_id
    FROM drivers
    WHERE season_id = ? AND code = 'VER'
  `).get(seasonId);
  assert.deepEqual(restoredDriver, {
    code: 'VER',
    name: 'Max Verstappen',
    team_name: 'Red Bull',
    external_id: 1,
  });

  const restoredEvent = db.prepare(`
    SELECT round_number, name, type
    FROM events
    WHERE season_id = ? AND round_number = 1 AND type = 'grand_prix'
  `).get(seasonId);
  assert.deepEqual(restoredEvent, {
    round_number: 1,
    name: 'Australian Grand Prix',
    type: 'grand_prix',
  });
});
