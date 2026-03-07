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
  const authRoutes = require('../routes/auth');
  return {
    ...dbModule,
    authRoutes,
  };
}

function setupDb() {
  process.env.DB_PATH = path.join(
    os.tmpdir(),
    `f1-calcutta-auth-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`,
  );
  const modules = freshModules();
  modules.init();
  return modules;
}

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    cookies: [],
    redirectedTo: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
      return this;
    },
    redirect(location) {
      this.statusCode = 302;
      this.redirectedTo = location;
      return this;
    },
    clearCookie() {
      return this;
    },
  };
}

function getRouteHandlers(router, method, path) {
  const layer = router.stack.find((entry) => entry.route && entry.route.path === path && entry.route.methods[method]);
  if (!layer) throw new Error(`Route not found for ${method.toUpperCase()} ${path}`);
  return layer.route.stack.map((entry) => entry.handle);
}

async function invokeRoute({ router, method, path, body, cookies, params }) {
  const handlers = getRouteHandlers(router, method, path);
  const req = {
    method: method.toUpperCase(),
    body: body || {},
    cookies: cookies || {},
    params: params || {},
    app: {
      get(name) {
        if (name === 'io') {
          return { emit() {} };
        }
        return null;
      },
    },
  };
  const res = createMockResponse();

  async function run(index) {
    if (index >= handlers.length || res.body || res.redirectedTo) return;
    await handlers[index](req, res, () => run(index + 1));
  }

  await run(0);
  return res;
}

test('pre-auction join still creates a new participant for a valid unmatched name', async () => {
  const { db, getActiveSeasonId, authRoutes } = setupDb();
  const seasonId = getActiveSeasonId();
  const season = db.prepare('SELECT invite_code FROM seasons WHERE id = ?').get(seasonId);

  const before = db.prepare('SELECT COUNT(*) as c FROM participants WHERE is_admin = 0').get().c;
  const response = await invokeRoute({
    router: authRoutes,
    method: 'post',
    path: '/join',
    body: {
      name: 'New Participant',
      inviteCode: season.invite_code,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.participant.name, 'New Participant');
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM participants WHERE is_admin = 0').get().c, before + 1);
});

test('post-auction join rejects unmatched names instead of creating a participant', async () => {
  const { db, getActiveSeasonId, authRoutes } = setupDb();
  const seasonId = getActiveSeasonId();
  const season = db.prepare('SELECT invite_code FROM seasons WHERE id = ?').get(seasonId);
  db.prepare(`UPDATE seasons SET auction_status = 'complete' WHERE id = ?`).run(seasonId);

  const before = db.prepare('SELECT COUNT(*) as c FROM participants WHERE is_admin = 0').get().c;
  const response = await invokeRoute({
    router: authRoutes,
    method: 'post',
    path: '/join',
    body: {
      name: 'Typo Name',
      inviteCode: season.invite_code,
    },
  });

  assert.equal(response.statusCode, 403);
  assert.match(response.body.error, /contact the admin/i);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM participants WHERE is_admin = 0').get().c, before);
});

test('post-auction join logs into an existing season participant on case-insensitive exact match', async () => {
  const { db, getActiveSeasonId, authRoutes } = setupDb();
  const seasonId = getActiveSeasonId();
  const season = db.prepare('SELECT invite_code FROM seasons WHERE id = ?').get(seasonId);
  db.prepare(`UPDATE seasons SET auction_status = 'complete' WHERE id = ?`).run(seasonId);

  const participantId = db.prepare(`
    INSERT INTO participants (name, color, session_token)
    VALUES ('Alice Driver', '#ff0000', NULL)
  `).run().lastInsertRowid;
  db.prepare(`
    INSERT INTO season_participants (season_id, participant_id)
    VALUES (?, ?)
  `).run(seasonId, participantId);

  const response = await invokeRoute({
    router: authRoutes,
    method: 'post',
    path: '/join',
    body: {
      name: 'alice driver',
      inviteCode: season.invite_code,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.participant.id, Number(participantId));
  assert.equal(response.cookies[0].name, 'session');
  assert.ok(db.prepare('SELECT session_token FROM participants WHERE id = ?').get(participantId).session_token);
});

test('post-auction join fails closed on duplicate normalized names', async () => {
  const { db, getActiveSeasonId, authRoutes } = setupDb();
  const seasonId = getActiveSeasonId();
  const season = db.prepare('SELECT invite_code FROM seasons WHERE id = ?').get(seasonId);
  db.prepare(`UPDATE seasons SET auction_status = 'complete' WHERE id = ?`).run(seasonId);

  const firstId = db.prepare(`
    INSERT INTO participants (name, color, session_token)
    VALUES ('Chris Pace', '#111111', NULL)
  `).run().lastInsertRowid;
  const secondId = db.prepare(`
    INSERT INTO participants (name, color, session_token)
    VALUES ('chris pace', '#222222', NULL)
  `).run().lastInsertRowid;
  db.prepare('INSERT INTO season_participants (season_id, participant_id) VALUES (?, ?)').run(seasonId, firstId);
  db.prepare('INSERT INTO season_participants (season_id, participant_id) VALUES (?, ?)').run(seasonId, secondId);

  const response = await invokeRoute({
    router: authRoutes,
    method: 'post',
    path: '/join',
    body: {
      name: 'Chris Pace',
      inviteCode: season.invite_code,
    },
  });

  assert.equal(response.statusCode, 409);
  assert.match(response.body.error, /multiple participants/i);
});

test('invalid invite code still rejects before any participant creation', async () => {
  const { db, authRoutes } = setupDb();
  const before = db.prepare('SELECT COUNT(*) as c FROM participants WHERE is_admin = 0').get().c;

  const response = await invokeRoute({
    router: authRoutes,
    method: 'post',
    path: '/join',
    body: {
      name: 'Wrong Code',
      inviteCode: 'BAD999',
    },
  });

  assert.equal(response.statusCode, 401);
  assert.match(response.body.error, /invalid invite code/i);
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM participants WHERE is_admin = 0').get().c, before);
});

test('participant access link signs a rostered participant in and redirects to dashboard', async () => {
  const { db, getActiveSeasonId, authRoutes } = setupDb();
  const seasonId = getActiveSeasonId();

  const participantId = db.prepare(`
    INSERT INTO participants (name, color, session_token)
    VALUES ('Access Tester', '#445566', 'access-token-123')
  `).run().lastInsertRowid;
  db.prepare(`
    INSERT INTO season_participants (season_id, participant_id)
    VALUES (?, ?)
  `).run(seasonId, participantId);

  const response = await invokeRoute({
    router: authRoutes,
    method: 'get',
    path: '/access/:token',
    params: { token: 'access-token-123' },
  });

  assert.equal(response.statusCode, 302);
  assert.equal(response.redirectedTo, '/dashboard');
  assert.equal(response.cookies[0].name, 'session');
});
