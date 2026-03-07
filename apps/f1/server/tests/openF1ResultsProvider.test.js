const test = require('node:test');
const assert = require('node:assert/strict');

const {
  OpenF1ResultsProvider,
  canonicalGrandPrixName,
} = require('../providers/openF1ResultsProvider');
const {
  createResultsProvider,
} = require('../providers');

function createNoAuthProvider(options = {}) {
  return new OpenF1ResultsProvider({
    username: '',
    password: '',
    ...options,
  });
}

test('createResultsProvider blocks mock in production and selects openf1 when configured', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousProvider = process.env.F1_RESULTS_PROVIDER;

  process.env.NODE_ENV = 'production';
  process.env.F1_RESULTS_PROVIDER = 'mock';
  let provider = createResultsProvider();
  assert.equal(provider.name, 'mock');
  assert.match(provider.getStatus().error, /disabled in production/i);

  process.env.F1_RESULTS_PROVIDER = 'openf1';
  provider = createResultsProvider();
  assert.equal(provider.name, 'openf1');

  process.env.NODE_ENV = previousNodeEnv;
  process.env.F1_RESULTS_PROVIDER = previousProvider;
});

test('MockResultsProvider reports its provider identity', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousProvider = process.env.F1_RESULTS_PROVIDER;

  process.env.NODE_ENV = 'development';
  process.env.F1_RESULTS_PROVIDER = 'mock';

  const provider = createResultsProvider();
  assert.equal(provider.name, 'mock');
  assert.equal(provider.getStatus().provider, 'mock');

  process.env.NODE_ENV = previousNodeEnv;
  process.env.F1_RESULTS_PROVIDER = previousProvider;
});

test('OpenF1ResultsProvider normalizes season schedule and event results', async () => {
  const responses = {
    '/v1/sessions?year=2026': [
      {
        session_key: 8999,
        meeting_key: 100,
        meeting_name: '',
        circuit_short_name: 'Sakhir',
        session_name: 'Practice 3',
        date_start: '2026-02-20T07:00:00Z',
        country_name: 'Bahrain',
        location: 'Bahrain',
      },
      {
        session_key: 9001,
        meeting_key: 101,
        meeting_name: '',
        circuit_short_name: 'Melbourne',
        session_name: 'Race',
        date_start: '2026-02-22T04:00:00Z',
        country_name: 'Australia',
        location: 'Melbourne',
      },
      {
        session_key: 9002,
        meeting_key: 102,
        meeting_name: '',
        circuit_short_name: 'Shanghai',
        session_name: 'Sprint',
        date_start: '2026-03-01T03:00:00Z',
        country_name: 'China',
        location: 'Shanghai',
      },
    ],
    '/v1/drivers?session_key=9002': [
      {
        driver_number: 1,
        name_acronym: 'VER',
        full_name: 'Max Verstappen',
        team_name: 'Oracle Red Bull Racing',
      },
    ],
    '/v1/session_result?session_key=9001': [
      { driver_number: 1, position: 2 },
      { driver_number: 16, position: 1 },
    ],
    '/v1/starting_grid?session_key=9001': [
      { driver_number: 1, position: 4 },
      { driver_number: 16, position: 2 },
    ],
    '/v1/pit?session_key=9001': [
      { driver_number: 1, stop_duration: 2.455 },
      { driver_number: 1, stop_duration: 3.102 },
      { driver_number: 16, stop_duration: 2.201 },
    ],
  };

  const provider = createNoAuthProvider({
    fetchImpl: async (url) => {
      const key = `${url.pathname}${url.search}`;
      return {
        ok: true,
        async json() {
          return responses[key] || [];
        },
      };
    },
  });

  const drivers = await provider.fetchDrivers({ year: 2026 });
  assert.deepEqual(drivers[0], {
    external_id: 1,
    code: 'VER',
    name: 'Max Verstappen',
    team_name: 'Oracle Red Bull Racing',
  });

  const schedule = await provider.fetchSeasonSchedule({ year: 2026 });
  assert.equal(schedule[0].type, 'grand_prix');
  assert.equal(schedule[0].round_number, 1);
  assert.equal(schedule[0].name, 'Australian Grand Prix');
  assert.equal(schedule[1].name, 'Chinese Grand Prix (Sprint)');
  assert.equal(schedule[1].round_number, 2);

  const results = await provider.fetchEventResults({
    event: { external_event_id: '9001' },
  });
  assert.deepEqual(results, [
    {
      external_driver_id: 16,
      driver_code: null,
      driver_name: null,
      team_name: null,
      finish_position: 1,
      start_position: 2,
      slowest_pit_stop_seconds: 2.201,
    },
    {
      external_driver_id: 1,
      driver_code: null,
      driver_name: null,
      team_name: null,
      finish_position: 2,
      start_position: 4,
      slowest_pit_stop_seconds: 3.102,
    },
  ]);
});

test('OpenF1ResultsProvider fetchDrivers uses the latest started non-testing session, including practice', async () => {
  const responses = {
    '/v1/sessions?year=2026': [
      {
        session_key: 1001,
        meeting_key: 10,
        session_name: 'Race',
        date_start: '2026-02-22T04:00:00Z',
        country_name: 'Australia',
        location: 'Melbourne',
      },
      {
        session_key: 1002,
        meeting_key: 11,
        session_name: 'Practice 1',
        date_start: '2026-03-03T04:00:00Z',
        country_name: 'China',
        location: 'Shanghai',
      },
    ],
    '/v1/drivers?session_key=1002': [
      {
        driver_number: 44,
        name_acronym: 'HAM',
        full_name: 'Lewis Hamilton',
        team_name: 'Ferrari',
      },
    ],
  };

  const provider = createNoAuthProvider({
    fetchImpl: async (url) => ({
      ok: true,
      async json() {
        return responses[`${url.pathname}${url.search}`] || [];
      },
      headers: { get() { return 'application/json'; } },
    }),
  });

  const drivers = await provider.fetchDrivers({ year: 2026 });
  assert.equal(drivers.length, 1);
  assert.equal(drivers[0].code, 'HAM');
});

test('OpenF1ResultsProvider fetchDrivers falls back when latest non-testing session has no driver payload yet', async () => {
  const responses = {
    '/v1/sessions?year=2026': [
      {
        session_key: 2001,
        meeting_key: 20,
        meeting_name: 'Australian Grand Prix',
        session_name: 'Race',
        date_start: '2026-02-20T01:00:00Z',
        country_name: 'Australia',
        location: 'Melbourne',
      },
      {
        session_key: 2002,
        meeting_key: 20,
        meeting_name: 'Australian Grand Prix',
        session_name: 'Race',
        date_start: '2026-02-22T04:00:00Z',
        country_name: 'Australia',
        location: 'Melbourne',
      },
      {
        session_key: 2999,
        meeting_key: 99,
        meeting_name: 'Pre-Season Testing',
        session_name: 'Practice 1',
        date_start: '2026-02-10T09:00:00Z',
        country_name: 'Bahrain',
        location: 'Sakhir',
      },
    ],
    '/v1/drivers?session_key=2001': [
      {
        driver_number: 81,
        name_acronym: 'PIA',
        full_name: 'Oscar Piastri',
        team_name: 'McLaren',
      },
    ],
    '/v1/session_result?session_key=2001': [
      { driver_number: 81, position: 1 },
    ],
  };

  const provider = createNoAuthProvider({
    fetchImpl: async (url) => {
      const key = `${url.pathname}${url.search}`;
      if (key === '/v1/drivers?session_key=2002') {
        return {
          ok: false,
          status: 404,
          async json() {
            return { detail: 'No results found.' };
          },
          headers: { get() { return 'application/json'; } },
        };
      }

      return {
        ok: true,
        async json() {
          return responses[key] || [];
        },
        headers: { get() { return 'application/json'; } },
      };
    },
  });

  const drivers = await provider.fetchDrivers({ year: 2026 });
  assert.equal(drivers.length, 1);
  assert.equal(drivers[0].code, 'PIA');
});

test('OpenF1ResultsProvider fetchDrivers falls back from session_key to meeting_key roster lookups', async () => {
  const responses = {
    '/v1/sessions?year=2026': [
      {
        session_key: 4001,
        meeting_key: 40,
        meeting_name: 'Australian Grand Prix',
        session_name: 'Practice 1',
        date_start: '2026-02-22T04:00:00Z',
        country_name: 'Australia',
        location: 'Melbourne',
      },
    ],
    '/v1/drivers?meeting_key=40': [
      {
        driver_number: 81,
        name_acronym: 'PIA',
        full_name: 'Oscar Piastri',
        team_name: 'McLaren',
      },
      {
        driver_number: 81,
        name_acronym: 'PIA',
        full_name: 'Oscar Piastri',
        team_name: 'McLaren',
      },
      {
        driver_number: 44,
        name_acronym: 'HAM',
        full_name: 'Lewis Hamilton',
        team_name: 'Ferrari',
      },
    ],
  };

  const provider = createNoAuthProvider({
    fetchImpl: async (url) => {
      const key = `${url.pathname}${url.search}`;
      if (key === '/v1/drivers?session_key=4001') {
        return {
          ok: false,
          status: 404,
          async json() {
            return { detail: 'No results found.' };
          },
          headers: { get() { return 'application/json'; } },
        };
      }

      return {
        ok: true,
        async json() {
          return responses[key] || [];
        },
        headers: { get() { return 'application/json'; } },
      };
    },
  });

  const drivers = await provider.fetchDrivers({ year: 2026 });
  assert.equal(drivers.length, 2);
  assert.equal(drivers[0].code, 'HAM');
  assert.equal(drivers[1].code, 'PIA');
});

test('OpenF1ResultsProvider fetchDrivers returns a clear message when no non-testing session has a populated roster yet', async () => {
  const provider = createNoAuthProvider({
    fetchImpl: async (url) => {
      const key = `${url.pathname}${url.search}`;
      if (key === '/v1/sessions?year=2026') {
        return {
          ok: true,
          async json() {
            return [
              {
                session_key: 3001,
                meeting_key: 30,
                meeting_name: 'Australian Grand Prix',
                session_name: 'Race',
                date_start: '2026-02-22T04:00:00Z',
                country_name: 'Australia',
                location: 'Melbourne',
              },
            ];
          },
          headers: { get() { return 'application/json'; } },
        };
      }

      return {
        ok: false,
        status: 404,
        async json() {
          return { detail: 'No results found.' };
        },
        headers: { get() { return 'application/json'; } },
      };
    },
  });

  await assert.rejects(
    () => provider.fetchDrivers({ year: 2026 }),
    /OpenF1 has no populated driver roster yet for 2026/i
  );
});

test('OpenF1ResultsProvider fetchLiveSessionSnapshot normalizes live race data', async () => {
  const responses = {
    '/v1/sessions?session_key=9001': [{
      session_key: 9001,
      meeting_key: 101,
      meeting_name: 'Australian Grand Prix',
      session_name: 'Race',
      date_start: '2026-02-22T04:00:00Z',
      date_end: '2026-02-22T06:00:00Z',
    }],
    '/v1/drivers?session_key=9001': [
      {
        driver_number: 1,
        name_acronym: 'VER',
        full_name: 'Max Verstappen',
        team_name: 'Oracle Red Bull Racing',
      },
      {
        driver_number: 81,
        name_acronym: 'PIA',
        full_name: 'Oscar Piastri',
        team_name: 'McLaren Formula 1 Team',
      },
    ],
    '/v1/position?session_key=9001': [
      { driver_number: 1, position: 2, date: '2026-02-22T04:20:00Z' },
      { driver_number: 81, position: 1, date: '2026-02-22T04:20:01Z' },
    ],
    '/v1/intervals?session_key=9001': [
      { driver_number: 1, interval: '+1.4', gap_to_leader: '+1.4', date: '2026-02-22T04:20:00Z' },
      { driver_number: 81, interval: 'LEADER', gap_to_leader: 'LEADER', date: '2026-02-22T04:20:01Z' },
    ],
    '/v1/pit?session_key=9001': [
      { driver_number: 1, stop_duration: 5.41, date_of_pit_out: '2026-02-22T04:08:00Z' },
      { driver_number: 1, stop_duration: 2.98, date_of_pit_out: '2026-02-22T04:10:00Z' },
    ],
    '/v1/race_control?session_key=9001': [
      { category: 'Track Status', flag: 'SC', message: 'Safety Car Deployed', date: '2026-02-22T04:20:02Z' },
    ],
    '/v1/starting_grid?session_key=9001': [
      { driver_number: 1, position: 4 },
      { driver_number: 81, position: 1 },
    ],
    '/v1/championship_drivers?session_key=9001': [
      { driver_number: 81, position: 1, points: 44 },
      { driver_number: 1, position: 2, points: 36 },
    ],
  };

  const provider = createNoAuthProvider({
    fetchImpl: async (url) => ({
      ok: true,
      headers: { get() { return 'application/json'; } },
      async json() {
        return responses[`${url.pathname}${url.search}`] || [];
      },
    }),
  });

  const snapshot = await provider.fetchLiveSessionSnapshot({
    event: { id: 1, external_event_id: '9001', name: 'Australian Grand Prix' },
  });

  assert.equal(snapshot.available, true);
  assert.equal(snapshot.isLive, true);
  assert.equal(snapshot.leaders[0].driver_code, 'PIA');
  assert.equal(snapshot.leaders[1].positionsGained, 2);
  assert.equal(snapshot.trackStatus.flag, 'SC');
  assert.equal(snapshot.driverStates[1].lastPitStopSeconds, 2.98);
  assert.equal(snapshot.driverStates[1].slowestPitStopSeconds, 5.41);
  assert.equal(snapshot.championshipDrivers[0].championshipPosition, 1);
});

test('OpenF1ResultsProvider authenticates and retries after 401', async () => {
  const calls = [];
  const provider = createNoAuthProvider({
    username: 'user@example.com',
    password: 'secret',
    fetchImpl: async (url, options = {}) => {
      calls.push({
        url: typeof url === 'string' ? url : url.toString(),
        headers: options.headers || {},
        method: options.method || 'GET',
      });

      if (String(url).endsWith('/token')) {
        return {
          ok: true,
          async json() {
            return { access_token: 'test-token', expires_in: 3600 };
          },
          headers: { get() { return 'application/json'; } },
        };
      }

      const authHeader = options.headers?.Authorization;
      if (authHeader !== 'Bearer test-token') {
        return {
          ok: false,
          status: 401,
          async json() {
            return { detail: 'Live F1 session in progress' };
          },
          headers: { get() { return 'application/json'; } },
        };
      }

      return {
        ok: true,
        async json() {
          return [];
        },
        headers: { get() { return 'application/json'; } },
      };
    },
  });

  provider.accessToken = 'stale-token';
  provider.accessTokenExpiresAt = Date.now() + 120_000;

  await provider.request('/sessions', { year: 2026 });

  assert.equal(calls.length, 3);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[1].method, 'POST');
  assert.match(calls[1].url, /\/token$/);
  assert.equal(calls[2].headers.Authorization, 'Bearer test-token');
  assert.equal(provider.getStatus().authConfigured, true);
  assert.equal(provider.getStatus().tokenCached, true);
});

test('OpenF1ResultsProvider caches token across requests', async () => {
  let tokenCalls = 0;
  const provider = createNoAuthProvider({
    username: 'user@example.com',
    password: 'secret',
    fetchImpl: async (url, options = {}) => {
      if (String(url).endsWith('/token')) {
        tokenCalls += 1;
        return {
          ok: true,
          async json() {
            return { access_token: 'cached-token', expires_in: 3600 };
          },
          headers: { get() { return 'application/json'; } },
        };
      }

      return {
        ok: true,
        async json() {
          return [];
        },
        headers: { get() { return 'application/json'; } },
      };
    },
  });

  await provider.request('/sessions', { year: 2026 });
  await provider.request('/sessions', { year: 2025 });

  assert.equal(tokenCalls, 1);
});

test('OpenF1ResultsProvider retries after rate limiting', async () => {
  let attempts = 0;
  const provider = createNoAuthProvider({
    minRequestIntervalMs: 1,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts < 3) {
        return {
          ok: false,
          status: 429,
          async json() {
            return { detail: 'Rate limit exceeded. Max 6 requests/second.' };
          },
          headers: {
            get(name) {
              return String(name).toLowerCase() === 'content-type' ? 'application/json' : null;
            },
          },
        };
      }

      return {
        ok: true,
        async json() {
          return [];
        },
        headers: { get() { return 'application/json'; } },
      };
    },
  });

  await provider.request('/sessions', { year: 2026 });
  assert.equal(attempts, 3);
  assert.equal(provider.getStatus().rateLimitGuardMs, 1);
});

test('OpenF1ResultsProvider enforces the rolling per-minute request budget', async () => {
  let now = 0;
  const sleeps = [];
  let requests = 0;

  const provider = createNoAuthProvider({
    minRequestIntervalMs: 0,
    minuteWindowMs: 60_000,
    maxRequestsPerMinute: 2,
    nowImpl: () => now,
    sleepImpl: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
    fetchImpl: async () => {
      requests += 1;
      return {
        ok: true,
        async json() {
          return [];
        },
        headers: { get() { return 'application/json'; } },
      };
    },
  });

  await provider.request('/sessions', { year: 2026 });
  await provider.request('/drivers', { session_key: 1001 });
  await provider.request('/session_result', { session_key: 1001 });

  assert.equal(requests, 3);
  assert.deepEqual(sleeps, [60000]);
  assert.equal(provider.getStatus().maxRequestsPerMinute, 2);
});

test('canonicalGrandPrixName derives expected names from OpenF1 location data', () => {
  assert.equal(canonicalGrandPrixName({ location: 'Austin', country_name: 'United States' }), 'United States Grand Prix');
  assert.equal(canonicalGrandPrixName({ location: 'Miami Gardens', country_name: 'United States' }), 'Miami Grand Prix');
  assert.equal(canonicalGrandPrixName({ location: 'São Paulo', country_name: 'Brazil' }), 'Sao Paulo Grand Prix');
  assert.equal(canonicalGrandPrixName({ circuit_short_name: 'Melbourne', country_name: 'Australia' }), 'Australian Grand Prix');
});
