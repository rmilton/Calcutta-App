const DEFAULT_BASE_URL = 'https://api.openf1.org/v1';
const DEFAULT_TOKEN_PATH = '/token';
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 200;
const DEFAULT_MINUTE_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS_PER_MINUTE = 60;
const DEFAULT_MAX_RATE_LIMIT_RETRIES = 3;
const EVENT_NAME_OVERRIDES = {
  melbourne: 'Australian Grand Prix',
  shanghai: 'Chinese Grand Prix',
  suzuka: 'Japanese Grand Prix',
  sakhir: 'Bahrain Grand Prix',
  jeddah: 'Saudi Arabian Grand Prix',
  'miami gardens': 'Miami Grand Prix',
  'monte carlo': 'Monaco Grand Prix',
  barcelona: 'Spanish Grand Prix',
  catalunya: 'Barcelona-Catalunya Grand Prix',
  spielberg: 'Austrian Grand Prix',
  silverstone: 'British Grand Prix',
  spa: 'Belgian Grand Prix',
  'spa-francorchamps': 'Belgian Grand Prix',
  budapest: 'Hungarian Grand Prix',
  zandvoort: 'Dutch Grand Prix',
  monza: 'Italian Grand Prix',
  madrid: 'Spanish Grand Prix',
  baku: 'Azerbaijan Grand Prix',
  'marina bay': 'Singapore Grand Prix',
  austin: 'United States Grand Prix',
  'mexico city': 'Mexico City Grand Prix',
  'sao paulo': 'Sao Paulo Grand Prix',
  'são paulo': 'Sao Paulo Grand Prix',
  'las vegas': 'Las Vegas Grand Prix',
  lusail: 'Qatar Grand Prix',
  'yas marina': 'Abu Dhabi Grand Prix',
  'yas marina circuit': 'Abu Dhabi Grand Prix',
  montreal: 'Canadian Grand Prix',
  'montréal': 'Canadian Grand Prix',
};

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function deriveTokenUrl(baseUrl, explicitTokenUrl) {
  if (explicitTokenUrl) return String(explicitTokenUrl).trim();

  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.endsWith('/v1')) {
    return `${normalized.slice(0, -3)}${DEFAULT_TOKEN_PATH}`;
  }

  try {
    const url = new URL(normalized);
    return `${url.origin}${DEFAULT_TOKEN_PATH}`;
  } catch {
    return DEFAULT_TOKEN_PATH;
  }
}

function parseIsoDate(value) {
  const iso = String(value || '');
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function toTimestampMs(value) {
  const iso = String(value || '');
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function subtractMinutes(iso, minutes) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms - (minutes * 60 * 1000)).toISOString();
}

function normalizeSessionType(sessionName) {
  if (sessionName === 'Race') return 'grand_prix';
  if (sessionName === 'Sprint') return 'sprint';
  return null;
}

function isTestingSession(session = {}) {
  const fields = [
    session.session_name,
    session.meeting_name,
    session.meeting_official_name,
    session.location,
    session.country_name,
    session.circuit_short_name,
  ];

  return fields.some((value) => /test/i.test(String(value || '')));
}

function isNoResultsFoundError(error) {
  return /OpenF1 request failed \(404\): No results found\.?/i.test(String(error?.message || ''));
}

function normalizeProviderDriverRows(drivers) {
  const deduped = new Map();

  drivers.forEach((driver) => {
    const externalId = Number(driver.driver_number);
    if (!Number.isFinite(externalId)) return;

    deduped.set(externalId, {
      external_id: externalId,
      code: String(driver.name_acronym || '').trim(),
      name: String(driver.full_name || '').trim(),
      team_name: String(driver.team_name || '').trim(),
    });
  });

  return [...deduped.values()].sort((a, b) => a.external_id - b.external_id);
}

function canonicalGrandPrixName(session) {
  const candidates = [
    session?.meeting_name,
    session?.location,
    session?.circuit_short_name,
  ];

  for (const candidate of candidates) {
    const key = String(candidate || '').trim().toLowerCase();
    if (key && EVENT_NAME_OVERRIDES[key]) {
      return EVENT_NAME_OVERRIDES[key];
    }
  }

  const country = String(session?.country_name || '').trim();
  if (country === 'United States') return 'United States Grand Prix';
  if (country === 'Saudi Arabia') return 'Saudi Arabian Grand Prix';
  if (country) return `${country} Grand Prix`;
  return 'Grand Prix';
}

function buildEventName(session, eventType) {
  const base = canonicalGrandPrixName(session);
  if (!base) return eventType === 'sprint' ? 'Sprint' : 'Grand Prix';
  return eventType === 'sprint' ? `${base} (Sprint)` : base;
}

async function parseErrorDetail(response) {
  const contentType = String(response.headers?.get?.('content-type') || '');

  try {
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return data?.detail || data?.error || data?.message || '';
    }

    const text = await response.text();
    return String(text || '').trim();
  } catch {
    return '';
  }
}

function parseRetryDelayMs(response, attempt, minRequestIntervalMs) {
  const retryAfter = String(response.headers?.get?.('retry-after') || '').trim();
  const retrySeconds = Number(retryAfter);
  if (Number.isFinite(retrySeconds) && retrySeconds >= 0) {
    return Math.max(retrySeconds * 1000, minRequestIntervalMs);
  }

  return Math.max(minRequestIntervalMs * (attempt + 1), 300);
}

function pickMostRecentRow(rows, fields = ['date', 'date_start', 'date_end']) {
  return (rows || []).reduce((latest, row) => {
    const latestMs = latest ? Math.max(...fields.map((field) => toTimestampMs(latest[field])).filter(Number.isFinite), -Infinity) : -Infinity;
    const rowMs = Math.max(...fields.map((field) => toTimestampMs(row[field])).filter(Number.isFinite), -Infinity);
    return rowMs >= latestMs ? row : latest;
  }, null);
}

function normalizeTrackStatus(row) {
  if (!row) return null;

  const category = String(row.category || '').trim();
  const message = String(row.message || row.flag || row.scope || '').trim();
  const label = [category, message].filter(Boolean).join(' - ') || 'Track status update';

  return {
    category,
    flag: row.flag || null,
    scope: row.scope || null,
    message,
    label,
    date: parseIsoDate(row.date),
  };
}

class OpenF1ResultsProvider {
  constructor({
    baseUrl = DEFAULT_BASE_URL,
    tokenUrl,
    username = process.env.OPENF1_USERNAME,
    password = process.env.OPENF1_PASSWORD,
    fetchImpl = global.fetch,
    sleepImpl = sleep,
    nowImpl = Date.now,
    minRequestIntervalMs = DEFAULT_MIN_REQUEST_INTERVAL_MS,
    minuteWindowMs = DEFAULT_MINUTE_WINDOW_MS,
    maxRequestsPerMinute = DEFAULT_MAX_REQUESTS_PER_MINUTE,
    maxRateLimitRetries = DEFAULT_MAX_RATE_LIMIT_RETRIES,
  } = {}) {
    this.name = 'openf1';
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.tokenUrl = deriveTokenUrl(baseUrl, tokenUrl || process.env.OPENF1_TOKEN_URL);
    this.username = username;
    this.password = password;
    this.fetchImpl = fetchImpl;
    this.sleepImpl = sleepImpl;
    this.nowImpl = nowImpl;
    this.minRequestIntervalMs = minRequestIntervalMs;
    this.minuteWindowMs = minuteWindowMs;
    this.maxRequestsPerMinute = maxRequestsPerMinute;
    this.maxRateLimitRetries = maxRateLimitRetries;
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
    this.tokenPromise = null;
    this.nextRequestAt = 0;
    this.requestTimestamps = [];
    this.requestQueue = Promise.resolve();
  }

  get authConfigured() {
    return Boolean(this.username && this.password);
  }

  async getAccessToken({ forceRefresh = false } = {}) {
    const now = this.nowImpl();
    if (!forceRefresh && this.accessToken && now < (this.accessTokenExpiresAt - 60_000)) {
      return this.accessToken;
    }

    if (!this.authConfigured) {
      throw new Error('OpenF1 authentication is required. Set OPENF1_USERNAME and OPENF1_PASSWORD.');
    }

    if (this.tokenPromise && !forceRefresh) {
      return this.tokenPromise;
    }

    this.tokenPromise = (async () => {
      const params = new URLSearchParams();
      params.set('username', this.username);
      params.set('password', this.password);

      const response = await this.fetchImpl(this.tokenUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      });

      if (!response.ok) {
        const detail = await parseErrorDetail(response);
        throw new Error(detail
          ? `OpenF1 auth failed (${response.status}): ${detail}`
          : `OpenF1 auth failed (${response.status})`);
      }

      const data = await response.json();
      const accessToken = String(data?.access_token || '').trim();
      const expiresInSeconds = Number(data?.expires_in);

      if (!accessToken) {
        throw new Error('OpenF1 auth failed: missing access token in response.');
      }

      this.accessToken = accessToken;
      this.accessTokenExpiresAt = now + ((Number.isFinite(expiresInSeconds) ? expiresInSeconds : 3600) * 1000);
      return this.accessToken;
    })();

    try {
      return await this.tokenPromise;
    } finally {
      this.tokenPromise = null;
    }
  }

  enqueueRequest(work) {
    const run = this.requestQueue.then(work, work);
    this.requestQueue = run.catch(() => {});
    return run;
  }

  pruneRequestTimestamps(now) {
    this.requestTimestamps = this.requestTimestamps.filter(
      (timestamp) => (now - timestamp) < this.minuteWindowMs
    );
  }

  async waitForRateLimitSlot() {
    while (true) {
      const now = this.nowImpl();
      this.pruneRequestTimestamps(now);

      const delays = [];
      const intervalDelay = this.nextRequestAt - now;
      if (intervalDelay > 0) delays.push(intervalDelay);

      if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
        const oldest = this.requestTimestamps[0];
        const minuteDelay = (oldest + this.minuteWindowMs) - now;
        if (minuteDelay > 0) delays.push(minuteDelay);
      }

      const waitMs = delays.length ? Math.max(...delays) : 0;
      if (waitMs <= 0) return;
      await this.sleepImpl(waitMs);
    }
  }

  noteRequestSent() {
    const now = this.nowImpl();
    this.requestTimestamps.push(now);
    this.pruneRequestTimestamps(now);
    this.nextRequestAt = now + this.minRequestIntervalMs;
  }

  async performRequest(path, params = {}, { forceAuthRefresh = false } = {}) {
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('Fetch is unavailable in this runtime');
    }

    const url = new URL(`${this.baseUrl}${path}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const headers = { Accept: 'application/json' };
      if (this.authConfigured) {
        headers.Authorization = `Bearer ${await this.getAccessToken({ forceRefresh: forceAuthRefresh })}`;
      }

      let response;
      let attempt = 0;

      while (attempt <= this.maxRateLimitRetries) {
        await this.waitForRateLimitSlot();
        response = await this.fetchImpl(url, { headers, signal: controller.signal });
        this.noteRequestSent();

        if (response.status !== 429 || attempt === this.maxRateLimitRetries) {
          break;
        }

        await this.sleepImpl(parseRetryDelayMs(response, attempt, this.minRequestIntervalMs));
        attempt += 1;
      }

      if (response.status === 401 && !forceAuthRefresh) {
        if (!this.authConfigured) {
          const detail = await parseErrorDetail(response);
          throw new Error(detail
            ? `OpenF1 request failed (401): ${detail}. Configure OPENF1_USERNAME and OPENF1_PASSWORD for live-session access.`
            : 'OpenF1 request failed (401). Configure OPENF1_USERNAME and OPENF1_PASSWORD for live-session access.');
        }
        this.accessToken = null;
        this.accessTokenExpiresAt = 0;
        return this.performRequest(path, params, { forceAuthRefresh: true });
      }

      if (!response.ok) {
        const detail = await parseErrorDetail(response);
        throw new Error(detail
          ? `OpenF1 request failed (${response.status}): ${detail}`
          : `OpenF1 request failed (${response.status})`);
      }

      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('OpenF1 request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async request(path, params = {}, options = {}) {
    return this.enqueueRequest(() => this.performRequest(path, params, options));
  }

  async fetchSessionMetadata(sessionKey) {
    const sessions = await this.request('/sessions', { session_key: sessionKey });
    const session = Array.isArray(sessions) ? sessions[0] : null;
    if (!session) return null;
    return {
      ...session,
      starts_at: parseIsoDate(session.date_start),
      ends_at: parseIsoDate(session.date_end),
    };
  }

  async fetchNormalizedDriverRoster(session) {
    if (!session?.session_key) return [];

    const lookups = [() => this.request('/drivers', { session_key: session.session_key })];
    if (session.meeting_key != null) {
      lookups.push(() => this.request('/drivers', { meeting_key: session.meeting_key }));
    }

    for (const lookup of lookups) {
      try {
        const drivers = await lookup();
        const normalized = normalizeProviderDriverRows(drivers);
        if (normalized.length) {
          return normalized;
        }
      } catch (error) {
        if (!isNoResultsFoundError(error)) {
          throw error;
        }
      }
    }

    return [];
  }

  async fetchSeasonSessions({ year }) {
    const sessions = await this.request('/sessions', { year });
    return sessions
      .map((session) => ({
        ...session,
        starts_at: parseIsoDate(session.date_start),
        event_type: normalizeSessionType(session.session_name),
      }))
      .filter((session) => session.event_type && session.starts_at)
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  }

  async fetchDrivers({ year }) {
    const sessions = await this.request('/sessions', { year });
    const candidateSessions = sessions
      .map((session) => ({
        ...session,
        starts_at: parseIsoDate(session.date_start),
      }))
      .filter((session) => (
        session.session_key
        && session.starts_at
        && !isTestingSession(session)
      ))
      .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));

    const startedCandidates = candidateSessions
      .filter((session) => Date.parse(session.starts_at) <= Date.now());

    const orderedCandidates = startedCandidates.length
      ? startedCandidates
      : candidateSessions;

    if (!orderedCandidates.length) {
      throw new Error(`OpenF1 has no non-testing sessions yet for ${year}`);
    }

    let lastNoResultsSession = null;

    for (const session of orderedCandidates) {
      try {
        const normalized = await this.fetchNormalizedDriverRoster(session);
        if (normalized.length) return normalized;
        lastNoResultsSession = session;
      } catch (error) {
        if (!isNoResultsFoundError(error)) {
          throw error;
        }
        lastNoResultsSession = session;
      }
    }

    const sessionLabel = lastNoResultsSession?.session_name || 'eligible session';
    throw new Error(`OpenF1 has no populated driver roster yet for ${year}. Tried the latest non-testing ${sessionLabel.toLowerCase()} via session and meeting lookups.`);
  }

  async fetchSeasonSchedule({ year }) {
    const sessions = await this.fetchSeasonSessions({ year });
    const meetingRoundMap = new Map();
    let nextRound = 1;

    return sessions.map((session) => {
      const meetingKey = String(session.meeting_key || '');
      if (!meetingRoundMap.has(meetingKey)) {
        meetingRoundMap.set(meetingKey, nextRound);
        nextRound += 1;
      }

      return ({
      external_event_id: String(session.session_key),
      round_number: meetingRoundMap.get(meetingKey),
      name: buildEventName(session, session.event_type),
      type: session.event_type,
      starts_at: session.starts_at,
      lock_at: subtractMinutes(session.starts_at, 10),
      meeting_key: session.meeting_key,
      location: session.location || null,
      country_name: session.country_name || null,
      meeting_name: session.meeting_name || null,
      });
    });
  }

  async fetchEventResults({ event }) {
    const sessionKey = Number(event?.external_event_id);
    if (!Number.isFinite(sessionKey)) {
      throw new Error(`Event ${event?.id || ''} is missing an OpenF1 session key`);
    }

    const session = await this.fetchSessionMetadata(sessionKey);
    const [sessionResults, startingGrid, pitStops, roster] = await Promise.all([
      this.request('/session_result', { session_key: sessionKey }),
      this.request('/starting_grid', { session_key: sessionKey }),
      this.request('/pit', { session_key: sessionKey }),
      this.fetchNormalizedDriverRoster(session || { session_key: sessionKey }),
    ]);

    const gridByDriver = new Map(
      startingGrid.map((row) => [Number(row.driver_number), Number(row.position) || null])
    );
    const rosterByDriver = new Map(
      roster.map((driver) => [Number(driver.external_id), driver])
    );
    const slowestPitByDriver = new Map();

    pitStops.forEach((row) => {
      const driverNumber = Number(row.driver_number);
      const stopDuration = Number(row.stop_duration);
      if (!Number.isFinite(driverNumber) || !Number.isFinite(stopDuration) || stopDuration <= 0) return;

      const current = slowestPitByDriver.get(driverNumber);
      if (current == null || stopDuration > current) {
        slowestPitByDriver.set(driverNumber, stopDuration);
      }
    });

    const rows = sessionResults
      .map((row) => ({
        external_driver_id: Number(row.driver_number),
        driver_code: rosterByDriver.get(Number(row.driver_number))?.code || null,
        driver_name: rosterByDriver.get(Number(row.driver_number))?.name || null,
        team_name: rosterByDriver.get(Number(row.driver_number))?.team_name || null,
        finish_position: Number(row.position),
        start_position: gridByDriver.get(Number(row.driver_number)) ?? null,
        slowest_pit_stop_seconds: slowestPitByDriver.get(Number(row.driver_number)) ?? null,
      }))
      .filter((row) => Number.isFinite(row.external_driver_id) && Number.isFinite(row.finish_position) && row.finish_position > 0)
      .sort((a, b) => a.finish_position - b.finish_position);

    if (!rows.length) {
      throw new Error(`OpenF1 returned no classified results for session ${sessionKey}`);
    }

    return rows;
  }

  async fetchLiveSessionSnapshot({ event }) {
    const sessionKey = Number(event?.external_event_id);
    if (!Number.isFinite(sessionKey)) {
      throw new Error(`Event ${event?.id || ''} is missing an OpenF1 session key`);
    }

    const session = await this.fetchSessionMetadata(sessionKey);
    const optionalRequest = async (path, params) => {
      try {
        return await this.request(path, params);
      } catch (error) {
        if (isNoResultsFoundError(error)) return [];
        throw error;
      }
    };

    const [roster, positions, intervals, pitStops, raceControl, startingGrid, championshipDrivers] = await Promise.all([
      this.fetchNormalizedDriverRoster(session || { session_key: sessionKey }),
      optionalRequest('/position', { session_key: sessionKey }),
      optionalRequest('/intervals', { session_key: sessionKey }),
      optionalRequest('/pit', { session_key: sessionKey }),
      optionalRequest('/race_control', { session_key: sessionKey }),
      optionalRequest('/starting_grid', { session_key: sessionKey }),
      optionalRequest('/championship_drivers', { session_key: sessionKey }),
    ]);

    const rosterByDriver = new Map(roster.map((driver) => [Number(driver.external_id), driver]));
    const gridByDriver = new Map(
      (startingGrid || []).map((row) => [Number(row.driver_number), Number(row.position) || null]),
    );

    const positionsByDriver = new Map();
    (positions || []).forEach((row) => {
      const driverNumber = Number(row.driver_number);
      if (!Number.isFinite(driverNumber)) return;
      const current = positionsByDriver.get(driverNumber);
      const candidate = pickMostRecentRow([current, row].filter(Boolean));
      positionsByDriver.set(driverNumber, candidate);
    });

    const intervalsByDriver = new Map();
    (intervals || []).forEach((row) => {
      const driverNumber = Number(row.driver_number);
      if (!Number.isFinite(driverNumber)) return;
      const current = intervalsByDriver.get(driverNumber);
      const candidate = pickMostRecentRow([current, row].filter(Boolean));
      intervalsByDriver.set(driverNumber, candidate);
    });

    const latestPitByDriver = new Map();
    (pitStops || []).forEach((row) => {
      const driverNumber = Number(row.driver_number);
      if (!Number.isFinite(driverNumber)) return;
      const current = latestPitByDriver.get(driverNumber);
      const candidate = pickMostRecentRow([current, row].filter(Boolean), ['date', 'date_of_pit_in', 'date_of_pit_out']);
      latestPitByDriver.set(driverNumber, candidate);
    });

    const championshipByDriver = new Map();
    (championshipDrivers || []).forEach((row) => {
      const driverNumber = Number(row.driver_number);
      if (!Number.isFinite(driverNumber)) return;
      championshipByDriver.set(driverNumber, row);
    });

    const driverStates = [...positionsByDriver.entries()]
      .map(([driverNumber, positionRow]) => {
        const rosterRow = rosterByDriver.get(driverNumber) || {};
        const intervalRow = intervalsByDriver.get(driverNumber) || {};
        const pitRow = latestPitByDriver.get(driverNumber) || {};
        const championshipRow = championshipByDriver.get(driverNumber) || {};
        const position = Number(positionRow?.position);
        const gridPosition = gridByDriver.get(driverNumber) ?? null;

        return {
          external_driver_id: driverNumber,
          driver_code: rosterRow.code || null,
          driver_name: rosterRow.name || null,
          team_name: rosterRow.team_name || null,
          position: Number.isFinite(position) ? position : null,
          gridPosition: Number.isFinite(gridPosition) ? gridPosition : null,
          positionsGained: Number.isFinite(position) && Number.isFinite(gridPosition) ? (gridPosition - position) : null,
          gapToLeader: intervalRow?.gap_to_leader || intervalRow?.gap || null,
          intervalToAhead: intervalRow?.interval || intervalRow?.interval_to_position_ahead || null,
          status: positionRow?.status || intervalRow?.status || null,
          lastPitStopSeconds: Number(pitRow?.stop_duration) > 0 ? Number(pitRow.stop_duration) : null,
          lastPitAt: parseIsoDate(pitRow?.date || pitRow?.date_of_pit_out || pitRow?.date_of_pit_in),
          championshipPosition: Number(championshipRow?.position) || null,
          championshipPoints: Number(championshipRow?.points) || null,
          updatedAt: parseIsoDate(positionRow?.date || intervalRow?.date),
        };
      })
      .filter((row) => row.position != null)
      .sort((a, b) => a.position - b.position);

    const latestRaceControl = pickMostRecentRow(raceControl || []);
    const leaders = driverStates.slice(0, 5);
    const championship = (championshipDrivers || [])
      .map((row) => {
        const driverNumber = Number(row.driver_number);
        const rosterRow = rosterByDriver.get(driverNumber) || {};
        return {
          external_driver_id: driverNumber,
          driver_code: rosterRow.code || null,
          driver_name: rosterRow.name || row.driver_name || null,
          team_name: rosterRow.team_name || row.team_name || null,
          championshipPosition: Number(row.position) || null,
          championshipPoints: Number(row.points) || null,
        };
      })
      .filter((row) => row.championshipPosition != null)
      .sort((a, b) => a.championshipPosition - b.championshipPosition)
      .slice(0, 5);

    const trackStatus = normalizeTrackStatus(latestRaceControl);
    const headline = leaders.length
      ? `${leaders[0].driver_name || leaders[0].driver_code || 'Leader'} leads ${session?.meeting_name || event?.name || 'the session'}.`
      : `Live updates from ${session?.meeting_name || event?.name || 'the current session'}.`;

    return {
      available: true,
      isLive: true,
      fetchedAt: new Date().toISOString(),
      headline,
      statusText: session?.session_name ? `${session.session_name} live` : 'Live session',
      session: session ? {
        sessionKey,
        sessionName: session.session_name || null,
        meetingName: session.meeting_name || null,
        startsAt: session.starts_at || null,
        endsAt: session.ends_at || null,
      } : null,
      trackStatus,
      leaders,
      championshipDrivers: championship,
      driverStates,
      ownedDrivers: [],
    };
  }

  getStatus() {
      return {
        provider: this.name,
        baseUrl: this.baseUrl,
        authConfigured: this.authConfigured,
        tokenCached: Boolean(this.accessToken),
        tokenExpiresAt: this.accessTokenExpiresAt || null,
        rateLimitGuardMs: this.minRequestIntervalMs,
        maxRequestsPerMinute: this.maxRequestsPerMinute,
      };
  }
}

module.exports = {
  OpenF1ResultsProvider,
  buildEventName,
  normalizeSessionType,
  canonicalGrandPrixName,
  normalizeProviderDriverRows,
};
