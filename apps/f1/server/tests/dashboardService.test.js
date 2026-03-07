const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');

function clearF1ServerModules() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes('/apps/f1/server/')) {
      delete require.cache[key];
    }
  }
}

function freshModules() {
  clearF1ServerModules();
  const dbModule = require('../db');
  const standingsRoutes = require('../routes/standings');
  const dashboardService = require('../services/dashboardService');
  const briefingService = require('../services/dashboardBriefingService');
  return {
    ...dbModule,
    standingsRoutes,
    dashboardService,
    briefingService,
  };
}

function setupDb() {
  process.env.DB_PATH = path.join(
    os.tmpdir(),
    `f1-calcutta-dashboard-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`,
  );
  const modules = freshModules();
  modules.init();
  return modules;
}

function createParticipant(db, seasonId, {
  name,
  token,
  color = '#ffffff',
  isAdmin = false,
} = {}) {
  const participantId = db.prepare(`
    INSERT INTO participants (name, color, is_admin, session_token)
    VALUES (?, ?, ?, ?)
  `).run(name, color, isAdmin ? 1 : 0, token).lastInsertRowid;

  db.prepare(`
    INSERT INTO season_participants (season_id, participant_id)
    VALUES (?, ?)
  `).run(seasonId, participantId);

  return Number(participantId);
}

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function getRouteHandlers(router, method, path) {
  const layer = router.stack.find((entry) => entry.route && entry.route.path === path && entry.route.methods[method]);
  if (!layer) throw new Error(`Route not found for ${method.toUpperCase()} ${path}`);
  return layer.route.stack.map((entry) => entry.handle);
}

async function invokeRoute({ router, method, path, provider, cookies, body }) {
  const handlers = getRouteHandlers(router, method, path);
  const req = {
    method: method.toUpperCase(),
    cookies: cookies || {},
    body: body || {},
    app: {
      get(name) {
        if (name === 'resultsProvider') return provider || { name: 'mock' };
        return null;
      },
    },
  };
  const res = createMockResponse();

  async function run(index) {
    if (index >= handlers.length || res.body) return;
    await handlers[index](req, res, () => run(index + 1));
  }

  await run(0);
  return res;
}

test('GET /api/standings/dashboard rejects unauthenticated requests', async () => {
  const { standingsRoutes } = setupDb();
  const response = await invokeRoute({
    router: standingsRoutes,
    method: 'get',
    path: '/dashboard',
  });
  assert.equal(response.statusCode, 401);
});

test('GET /api/standings/dashboard returns participant summary, portfolio, and fallback live state', async () => {
  const { db, getActiveSeasonId, standingsRoutes, saveDashboardBriefing } = setupDb();
  const seasonId = getActiveSeasonId();
  const alphaId = createParticipant(db, seasonId, {
    name: 'Alpha',
    token: 'alpha-session',
    color: '#ff0000',
  });
  const bravoId = createParticipant(db, seasonId, {
    name: 'Bravo',
    token: 'bravo-session',
    color: '#00ff00',
  });

  const drivers = db.prepare('SELECT id FROM drivers WHERE season_id = ? ORDER BY id ASC LIMIT 2').all(seasonId);
  const event = db.prepare('SELECT id FROM events WHERE season_id = ? ORDER BY round_number ASC LIMIT 1').get(seasonId);

  db.prepare(`
    INSERT INTO ownership (season_id, driver_id, participant_id, purchase_price_cents)
    VALUES (?, ?, ?, ?)
  `).run(seasonId, drivers[0].id, alphaId, 2500);

  db.prepare(`
    INSERT INTO ownership (season_id, driver_id, participant_id, purchase_price_cents)
    VALUES (?, ?, ?, ?)
  `).run(seasonId, drivers[1].id, bravoId, 2000);

  db.prepare(`
    INSERT INTO event_payouts (season_id, event_id, participant_id, driver_id, category, amount_cents)
    VALUES (?, ?, ?, ?, 'race_winner', ?)
  `).run(seasonId, event.id, alphaId, drivers[0].id, 4000);

  db.prepare(`
    INSERT INTO season_bonus_payouts (season_id, participant_id, driver_id, category, amount_cents)
    VALUES (?, ?, ?, 'drivers_champion', ?)
  `).run(seasonId, alphaId, drivers[0].id, 1000);

  saveDashboardBriefing(seasonId, alphaId, {
    eventId: event.id,
    snapshotHash: 'persisted-snapshot',
    phase: 'pre_race',
    title: 'Pre-race Outlook',
    summary: 'Persistent participant briefing.',
    content: {
      summary: 'Persistent participant briefing.',
      sections: [
        {
          heading: 'Your Position',
          bullets: ['You enter the weekend with the strongest net in the pool.'],
        },
      ],
    },
    source: 'anthropic',
    generatedAt: '2026-03-07T12:00:00Z',
    updatedAt: Date.parse('2026-03-07T12:00:00Z'),
  });

  const response = await invokeRoute({
    router: standingsRoutes,
    method: 'get',
    path: '/dashboard',
    provider: { name: 'mock' },
    cookies: { session: 'alpha-session' },
  });
  const payload = response.body;

  assert.equal(response.statusCode, 200);
  assert.equal(payload.viewer.name, 'Alpha');
  assert.equal(payload.viewer.isAdmin, false);
  assert.equal(payload.summary.rank, 1);
  assert.equal(payload.summary.totalEarnedCents, 5000);
  assert.equal(payload.summary.totalSpentCents, 2500);
  assert.equal(payload.summary.netCents, 2500);
  assert.equal(payload.portfolio.drivers.length, 1);
  assert.equal(payload.portfolio.drivers[0].driver_id, drivers[0].id);
  assert.equal(payload.liveSession.available, false);
  assert.match(payload.liveSession.degradedReason, /openf1 provider/i);
  assert.equal(payload.briefingMeta.mode, 'on_demand');
  assert.equal(payload.briefing.summary, 'Persistent participant briefing.');
  assert.equal(payload.briefing.phase, 'pre_race');
  assert.equal(payload.briefingHistory.length, 1);
  assert.ok(payload.primaryEvent);
  assert.ok(Array.isArray(payload.payoutBoard.rules));
  assert.ok(payload.payoutBoard.rules.length > 0);
  assert.equal(Array.isArray(payload.standings), true);
});

test('GET /api/standings/dashboard returns briefing history most recent first', async () => {
  const { db, getActiveSeasonId, standingsRoutes, saveDashboardBriefing } = setupDb();
  const seasonId = getActiveSeasonId();
  const participantId = createParticipant(db, seasonId, {
    name: 'History Tester',
    token: 'history-session',
    color: '#aa5500',
  });

  const events = db.prepare('SELECT id FROM events WHERE season_id = ? ORDER BY round_number ASC LIMIT 2').all(seasonId);

  saveDashboardBriefing(seasonId, participantId, {
    eventId: events[0].id,
    snapshotHash: 'old-snapshot',
    phase: 'pre_race',
    title: 'Older Brief',
    summary: 'Older saved briefing.',
    content: {
      summary: 'Older saved briefing.',
      sections: [{ heading: 'Your Position', bullets: ['Older item.'] }],
    },
    source: 'anthropic',
    generatedAt: '2026-03-06T10:00:00Z',
    updatedAt: Date.parse('2026-03-06T10:00:00Z'),
  });
  saveDashboardBriefing(seasonId, participantId, {
    eventId: events[1].id,
    snapshotHash: 'new-snapshot',
    phase: 'live',
    title: 'Newer Brief',
    summary: 'Newer saved briefing.',
    content: {
      summary: 'Newer saved briefing.',
      sections: [{ heading: 'Your Position', bullets: ['Newer item.'] }],
    },
    source: 'anthropic',
    generatedAt: '2026-03-07T10:00:00Z',
    updatedAt: Date.parse('2026-03-07T10:00:00Z'),
  });

  const response = await invokeRoute({
    router: standingsRoutes,
    method: 'get',
    path: '/dashboard',
    provider: { name: 'mock' },
    cookies: { session: 'history-session' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.briefingHistory.length, 2);
  assert.equal(response.body.briefingHistory[0].summary, 'Newer saved briefing.');
  assert.equal(response.body.briefingHistory[0].phase, 'live');
  assert.equal(response.body.briefingHistory[1].summary, 'Older saved briefing.');
});

test('GET /api/standings/dashboard returns admin summary without portfolio', async () => {
  const { db, getActiveSeasonId, standingsRoutes } = setupDb();
  const seasonId = getActiveSeasonId();

  createParticipant(db, seasonId, {
    name: 'Admin',
    token: 'admin-session',
    color: '#123456',
    isAdmin: true,
  });
  createParticipant(db, seasonId, {
    name: 'Participant',
    token: 'participant-session',
    color: '#654321',
  });

  const response = await invokeRoute({
    router: standingsRoutes,
    method: 'get',
    path: '/dashboard',
    provider: { name: 'mock' },
    cookies: { session: 'admin-session' },
  });
  const payload = response.body;

  assert.equal(response.statusCode, 200);
  assert.equal(payload.viewer.isAdmin, true);
  assert.equal(payload.portfolio, null);
  assert.equal(payload.summary.participantCount, 1);
  assert.equal(typeof payload.summary.totalPotCents, 'number');
});

test('POST /api/standings/dashboard/briefing degrades cleanly when Anthropic is unavailable', async () => {
  const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  const { db, getActiveSeasonId, standingsRoutes } = setupDb();
  const seasonId = getActiveSeasonId();
  createParticipant(db, seasonId, {
    name: 'Briefing Tester',
    token: 'briefing-session',
    color: '#abcdef',
  });

  try {
    const response = await invokeRoute({
      router: standingsRoutes,
      method: 'post',
      path: '/dashboard/briefing',
      provider: { name: 'mock' },
      cookies: { session: 'briefing-session' },
      body: { force: true },
    });
    const payload = response.body;

    assert.equal(response.statusCode, 200);
    assert.equal(payload.briefing.available, false);
    assert.match(payload.briefing.error, /not configured/i);
  } finally {
    process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
  }
});

test('selectPrimaryEvent prefers live, then upcoming, then most recent', async () => {
  const { dashboardService } = setupDb();
  const now = Date.parse('2026-04-05T05:15:00Z');
  const events = [
    {
      id: 1,
      external_event_id: '1001',
      round_number: 1,
      type: 'grand_prix',
      name: 'Past GP',
      starts_at: '2026-03-01T04:00:00Z',
    },
    {
      id: 2,
      external_event_id: '1002',
      round_number: 2,
      type: 'grand_prix',
      name: 'Current GP',
      starts_at: '2026-04-05T04:00:00Z',
    },
    {
      id: 3,
      external_event_id: '1003',
      round_number: 3,
      type: 'grand_prix',
      name: 'Next GP',
      starts_at: '2026-04-12T04:00:00Z',
    },
  ];

  const liveSelection = await dashboardService.selectPrimaryEvent({
    events,
    now,
    provider: {
      name: 'openf1',
      async fetchSessionMetadata(sessionKey) {
        if (sessionKey === 1002) {
          return {
            date_start: '2026-04-05T04:00:00Z',
            date_end: '2026-04-05T06:00:00Z',
          };
        }
        return null;
      },
    },
  });
  assert.equal(liveSelection.event.id, 2);
  assert.equal(liveSelection.state, 'live');

  const upcomingSelection = await dashboardService.selectPrimaryEvent({
    events,
    now,
    provider: {
      name: 'openf1',
      async fetchSessionMetadata() {
        return {
          date_start: '2026-04-05T04:00:00Z',
          date_end: '2026-04-05T04:30:00Z',
        };
      },
    },
  });
  assert.equal(upcomingSelection.event.id, 3);
  assert.equal(upcomingSelection.state, 'upcoming');

  const recentSelection = await dashboardService.selectPrimaryEvent({
    events: events.slice(0, 2),
    now: Date.parse('2026-05-01T05:15:00Z'),
    provider: {
      name: 'openf1',
      async fetchSessionMetadata() {
        return {
          date_start: '2026-04-05T04:00:00Z',
          date_end: '2026-04-05T04:30:00Z',
        };
      },
    },
  });
  assert.equal(recentSelection.event.id, 2);
  assert.equal(recentSelection.state, 'recent');
});

test('buildDashboardPayload resolves live grand prix payout board with ownership and draw pending state', async () => {
  const { db, getActiveSeasonId, dashboardService } = setupDb();
  const seasonId = getActiveSeasonId();
  const alphaId = createParticipant(db, seasonId, {
    name: 'Alpha',
    token: 'alpha-live-gp',
    color: '#ff0000',
  });
  const bravoId = createParticipant(db, seasonId, {
    name: 'Bravo',
    token: 'bravo-live-gp',
    color: '#00ff00',
  });

  const drivers = db.prepare(`
    SELECT id, external_id, code, name, team_name
    FROM drivers
    WHERE season_id = ?
    ORDER BY id ASC
    LIMIT 5
  `).all(seasonId);

  db.prepare(`
    UPDATE events
    SET external_event_id = '9001'
    WHERE season_id = ? AND round_number = 1 AND type = 'grand_prix'
  `).run(seasonId);

  db.prepare(`
    INSERT INTO ownership (season_id, driver_id, participant_id, purchase_price_cents)
    VALUES (?, ?, ?, ?)
  `).run(seasonId, drivers[0].id, alphaId, 2500);
  db.prepare(`
    INSERT INTO ownership (season_id, driver_id, participant_id, purchase_price_cents)
    VALUES (?, ?, ?, ?)
  `).run(seasonId, drivers[3].id, bravoId, 1900);

  const payload = await dashboardService.buildDashboardPayload({
    seasonId,
    viewer: {
      id: alphaId,
      name: 'Alpha',
      color: '#ff0000',
      is_admin: 0,
    },
    nowImpl: () => Date.parse('2026-03-08T05:00:00Z'),
    provider: {
      name: 'openf1',
      async fetchSessionMetadata() {
        return {
          date_start: '2026-03-08T04:00:00Z',
          date_end: '2026-03-08T06:00:00Z',
        };
      },
      async fetchLiveSessionSnapshot() {
        return {
          available: true,
          isLive: true,
          fetchedAt: '2026-03-08T05:00:05Z',
          headline: 'Live snapshot',
          statusText: 'Race live',
          trackStatus: null,
          driverStates: [
            { external_driver_id: drivers[0].external_id, driver_code: drivers[0].code, driver_name: drivers[0].name, team_name: drivers[0].team_name, position: 1, positionsGained: 0, slowestPitStopSeconds: null },
            { external_driver_id: drivers[1].external_id, driver_code: drivers[1].code, driver_name: drivers[1].name, team_name: drivers[1].team_name, position: 2, positionsGained: -1, slowestPitStopSeconds: null },
            { external_driver_id: drivers[2].external_id, driver_code: drivers[2].code, driver_name: drivers[2].name, team_name: drivers[2].team_name, position: 3, positionsGained: 1, slowestPitStopSeconds: null },
            { external_driver_id: drivers[3].external_id, driver_code: drivers[3].code, driver_name: drivers[3].name, team_name: drivers[3].team_name, position: 6, positionsGained: 3, slowestPitStopSeconds: 5.12 },
            { external_driver_id: drivers[4].external_id, driver_code: drivers[4].code, driver_name: drivers[4].name, team_name: drivers[4].team_name, position: 11, positionsGained: 4, slowestPitStopSeconds: 3.21 },
          ],
          leaders: [],
          championshipDrivers: [],
          ownedDrivers: [],
        };
      },
    },
  });

  assert.equal(payload.payoutBoard.eventType, 'grand_prix');
  assert.equal(payload.payoutBoard.isLive, true);
  assert.deepEqual(
    payload.payoutBoard.rules.map((rule) => rule.category),
    [
      'race_winner',
      'second_place',
      'third_place',
      'best_p6_or_lower',
      'best_p11_or_lower',
      'most_positions_gained',
      'slowest_pit_stop',
      'random_finish_bonus',
    ],
  );

  const raceWinner = payload.payoutBoard.rules.find((rule) => rule.category === 'race_winner');
  assert.equal(raceWinner.status, 'live');
  assert.equal(raceWinner.holders[0].driverId, drivers[0].id);
  assert.equal(raceWinner.holders[0].participantName, 'Alpha');
  assert.equal(raceWinner.holders[0].isViewerOwner, true);
  assert.equal(raceWinner.holders[0].displayValue, 'P1');

  const bestP6 = payload.payoutBoard.rules.find((rule) => rule.category === 'best_p6_or_lower');
  assert.equal(bestP6.holders[0].driverId, drivers[3].id);
  assert.equal(bestP6.holders[0].participantName, 'Bravo');
  assert.equal(bestP6.metric.display, 'P6');

  const bestP11 = payload.payoutBoard.rules.find((rule) => rule.category === 'best_p11_or_lower');
  assert.equal(bestP11.holders[0].driverId, drivers[4].id);
  assert.equal(bestP11.holders[0].participantName, null);

  const mostGained = payload.payoutBoard.rules.find((rule) => rule.category === 'most_positions_gained');
  assert.equal(mostGained.holders[0].driverId, drivers[4].id);
  assert.equal(mostGained.holders[0].displayValue, '+4');
  assert.equal(mostGained.metric.display, '+4');

  const slowestPit = payload.payoutBoard.rules.find((rule) => rule.category === 'slowest_pit_stop');
  assert.equal(slowestPit.holders[0].driverId, drivers[3].id);
  assert.equal(slowestPit.holders[0].displayValue, '5.12s');
  assert.equal(slowestPit.metric.display, '5.12s');

  const randomBonus = payload.payoutBoard.rules.find((rule) => rule.category === 'random_finish_bonus');
  assert.equal(randomBonus.status, 'draw_pending');
  assert.equal(randomBonus.holders.length, 0);
});

test('buildDashboardPayload limits sprint payout board to sprint-active categories', async () => {
  const { db, getActiveSeasonId, dashboardService } = setupDb();
  const seasonId = getActiveSeasonId();
  const viewerId = createParticipant(db, seasonId, {
    name: 'Sprint Viewer',
    token: 'sprint-viewer',
    color: '#112233',
  });

  const drivers = db.prepare(`
    SELECT id, external_id, code, name, team_name
    FROM drivers
    WHERE season_id = ?
    ORDER BY id ASC
    LIMIT 3
  `).all(seasonId);

  db.prepare(`
    UPDATE events
    SET external_event_id = '9002'
    WHERE season_id = ? AND round_number = 2 AND type = 'sprint'
  `).run(seasonId);

  const payload = await dashboardService.buildDashboardPayload({
    seasonId,
    viewer: {
      id: viewerId,
      name: 'Sprint Viewer',
      color: '#112233',
      is_admin: 0,
    },
    nowImpl: () => Date.parse('2026-03-14T03:15:00Z'),
    provider: {
      name: 'openf1',
      async fetchSessionMetadata() {
        return {
          date_start: '2026-03-14T03:00:00Z',
          date_end: '2026-03-14T04:00:00Z',
        };
      },
      async fetchLiveSessionSnapshot() {
        return {
          available: true,
          isLive: true,
          fetchedAt: '2026-03-14T03:15:00Z',
          statusText: 'Sprint live',
          driverStates: [
            { external_driver_id: drivers[0].external_id, driver_code: drivers[0].code, driver_name: drivers[0].name, team_name: drivers[0].team_name, position: 1, positionsGained: 0, slowestPitStopSeconds: null },
            { external_driver_id: drivers[1].external_id, driver_code: drivers[1].code, driver_name: drivers[1].name, team_name: drivers[1].team_name, position: 6, positionsGained: 2, slowestPitStopSeconds: null },
            { external_driver_id: drivers[2].external_id, driver_code: drivers[2].code, driver_name: drivers[2].name, team_name: drivers[2].team_name, position: 8, positionsGained: 4, slowestPitStopSeconds: null },
          ],
          leaders: [],
          championshipDrivers: [],
          ownedDrivers: [],
        };
      },
    },
  });

  assert.equal(payload.payoutBoard.eventType, 'sprint');
  assert.deepEqual(
    payload.payoutBoard.rules.map((rule) => rule.category),
    ['sprint_winner', 'best_p6_or_lower', 'most_positions_gained', 'random_finish_bonus'],
  );
});

test('buildDashboardPayload returns pending payout board for upcoming events', async () => {
  const { db, getActiveSeasonId, dashboardService } = setupDb();
  const seasonId = getActiveSeasonId();
  const viewerId = createParticipant(db, seasonId, {
    name: 'Pending Viewer',
    token: 'pending-viewer',
    color: '#334455',
  });

  const payload = await dashboardService.buildDashboardPayload({
    seasonId,
    viewer: {
      id: viewerId,
      name: 'Pending Viewer',
      color: '#334455',
      is_admin: 0,
    },
    nowImpl: () => Date.parse('2026-03-07T12:00:00Z'),
    provider: { name: 'mock' },
  });

  assert.ok(payload.payoutBoard.rules.length > 0);
  assert.ok(payload.payoutBoard.rules.every((rule) => rule.status === 'pending'));
  assert.ok(payload.payoutBoard.rules.every((rule) => rule.note === 'TBD until live timing data is available.'));
});

test('buildDashboardPayload shows the pre-drawn random target for upcoming events', async () => {
  const { db, getActiveSeasonId, dashboardService } = setupDb();
  const seasonId = getActiveSeasonId();
  const viewerId = createParticipant(db, seasonId, {
    name: 'Random Viewer',
    token: 'random-viewer',
    color: '#334455',
  });

  db.prepare(`
    UPDATE events
    SET random_bonus_position = 9
    WHERE season_id = ? AND round_number = 1 AND type = 'grand_prix'
  `).run(seasonId);

  const payload = await dashboardService.buildDashboardPayload({
    seasonId,
    viewer: {
      id: viewerId,
      name: 'Random Viewer',
      color: '#334455',
      is_admin: 0,
    },
    nowImpl: () => Date.parse('2026-03-07T12:00:00Z'),
    provider: { name: 'mock' },
  });

  const randomRule = payload.payoutBoard.rules.find((rule) => rule.category === 'random_finish_bonus');
  assert.equal(randomRule.status, 'pending');
  assert.equal(randomRule.metric?.display, 'P9');
  assert.equal(randomRule.note, 'Target position: P9.');
});

test('buildDashboardPayload marks payout board unavailable when live session load fails', async () => {
  const { db, getActiveSeasonId, dashboardService } = setupDb();
  const seasonId = getActiveSeasonId();
  const viewerId = createParticipant(db, seasonId, {
    name: 'Fallback Viewer',
    token: 'fallback-viewer',
    color: '#556677',
  });

  db.prepare(`
    UPDATE events
    SET external_event_id = '9001'
    WHERE season_id = ? AND round_number = 1 AND type = 'grand_prix'
  `).run(seasonId);

  const payload = await dashboardService.buildDashboardPayload({
    seasonId,
    viewer: {
      id: viewerId,
      name: 'Fallback Viewer',
      color: '#556677',
      is_admin: 0,
    },
    nowImpl: () => Date.parse('2026-03-08T05:00:00Z'),
    provider: {
      name: 'openf1',
      async fetchSessionMetadata() {
        return {
          date_start: '2026-03-08T04:00:00Z',
          date_end: '2026-03-08T06:00:00Z',
        };
      },
      async fetchLiveSessionSnapshot() {
        throw new Error('OpenF1 temporarily unavailable.');
      },
    },
  });

  assert.ok(payload.payoutBoard.rules.length > 0);
  assert.ok(payload.payoutBoard.rules.every((rule) => rule.status === 'unavailable'));
  assert.match(payload.payoutBoard.rules[0].note, /temporarily unavailable/i);
});

test('dashboard briefing service caches and refreshes on force', async () => {
  const { briefingService } = setupDb();
  let callCount = 0;
  const service = briefingService.createDashboardBriefingService({
    nowImpl: () => 1000,
    loadSavedHistory: () => [],
    loadSavedBriefing: () => null,
    persistBriefing: () => null,
    generator: async () => {
      callCount += 1;
      return {
        available: true,
        phase: 'live',
        title: `Briefing ${callCount}`,
        summary: `briefing-${callCount}`,
        sections: [
          { heading: 'Your Position', bullets: [`Bullet ${callCount}`] },
          { heading: 'Scenarios', bullets: [`If item ${callCount}`] },
          { heading: 'What To Watch', bullets: [`Watch ${callCount}`] },
        ],
        generatedAt: '2026-03-07T00:00:00Z',
        source: 'test',
      };
    },
  });

  const dashboardPayload = {
    seasonId: 1,
    viewer: { id: 42 },
    summary: { rank: 1 },
    primaryEvent: { id: 9, name: 'Test GP' },
    liveSession: { isLive: false },
    standings: [],
    portfolio: { drivers: [] },
  };

  const first = await service.getBriefing({ dashboardPayload, force: false });
  const second = await service.getBriefing({ dashboardPayload, force: false });
  const third = await service.getBriefing({ dashboardPayload, force: true });

  assert.match(first.text, /briefing-1/);
  assert.match(second.text, /briefing-1/);
  assert.equal(second.cached, true);
  assert.match(third.text, /briefing-2/);
  assert.equal(third.phase, 'live');
  assert.equal(callCount, 2);
});
