const test = require('node:test');
const assert = require('node:assert/strict');

const {
  OpenF1ResultsProvider,
  canonicalGrandPrixName,
} = require('../providers/openF1ResultsProvider');
const {
  createResultsProvider,
} = require('../providers');

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

  const provider = new OpenF1ResultsProvider({
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
    { external_driver_id: 16, finish_position: 1, start_position: 2, slowest_pit_stop_seconds: 2.201 },
    { external_driver_id: 1, finish_position: 2, start_position: 4, slowest_pit_stop_seconds: 3.102 },
  ]);
});

test('canonicalGrandPrixName derives expected names from OpenF1 location data', () => {
  assert.equal(canonicalGrandPrixName({ location: 'Austin', country_name: 'United States' }), 'United States Grand Prix');
  assert.equal(canonicalGrandPrixName({ location: 'Miami Gardens', country_name: 'United States' }), 'Miami Grand Prix');
  assert.equal(canonicalGrandPrixName({ location: 'São Paulo', country_name: 'Brazil' }), 'Sao Paulo Grand Prix');
  assert.equal(canonicalGrandPrixName({ circuit_short_name: 'Melbourne', country_name: 'Australia' }), 'Australian Grand Prix');
});
