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
    text: 'Persistent participant briefing.',
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
  assert.equal(payload.briefing.text, 'Persistent participant briefing.');
  assert.ok(payload.primaryEvent);
  assert.equal(Array.isArray(payload.standings), true);
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

test('dashboard briefing service caches and refreshes on force', async () => {
  const { briefingService } = setupDb();
  let callCount = 0;
  const service = briefingService.createDashboardBriefingService({
    nowImpl: () => 1000,
    loadSavedBriefing: () => null,
    persistBriefing: () => null,
    generator: async () => {
      callCount += 1;
      return {
        available: true,
        text: `briefing-${callCount}`,
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

  assert.equal(first.text, 'briefing-1');
  assert.equal(second.text, 'briefing-1');
  assert.equal(second.cached, true);
  assert.equal(third.text, 'briefing-2');
  assert.equal(callCount, 2);
});
