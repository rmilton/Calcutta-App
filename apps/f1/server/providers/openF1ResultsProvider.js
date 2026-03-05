const DEFAULT_BASE_URL = 'https://api.openf1.org/v1';
const EVENT_NAME_OVERRIDES = {
  melbourne: 'Australian Grand Prix',
  shanghai: 'Chinese Grand Prix',
  suzuka: 'Japanese Grand Prix',
  sakhir: 'Bahrain Grand Prix',
  jeddah: 'Saudi Arabian Grand Prix',
  'miami gardens': 'Miami Grand Prix',
  'monte carlo': 'Monaco Grand Prix',
  barcelona: 'Spanish Grand Prix',
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

function parseIsoDate(value) {
  const iso = String(value || '');
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
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

class OpenF1ResultsProvider {
  constructor({ baseUrl = DEFAULT_BASE_URL, fetchImpl = global.fetch } = {}) {
    this.name = 'openf1';
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.fetchImpl = fetchImpl;
  }

  async request(path, params = {}) {
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
      const response = await this.fetchImpl(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`OpenF1 request failed (${response.status})`);
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
    const allSessions = await this.request('/sessions', { year });
    const startedSessions = allSessions
      .map((session) => ({
        ...session,
        starts_at: parseIsoDate(session.date_start),
      }))
      .filter((session) => session.starts_at && Date.parse(session.starts_at) <= Date.now())
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));

    const sourceSession = startedSessions[startedSessions.length - 1];
    if (!sourceSession?.session_key) {
      throw new Error(`OpenF1 has no started sessions yet for ${year}`);
    }

    const drivers = await this.request('/drivers', { session_key: sourceSession.session_key });
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

    const [sessionResults, startingGrid] = await Promise.all([
      this.request('/session_result', { session_key: sessionKey }),
      this.request('/starting_grid', { session_key: sessionKey }),
    ]);

    const gridByDriver = new Map(
      startingGrid.map((row) => [Number(row.driver_number), Number(row.position) || null])
    );

    const rows = sessionResults
      .map((row) => ({
        external_driver_id: Number(row.driver_number),
        finish_position: Number(row.position),
        start_position: gridByDriver.get(Number(row.driver_number)) ?? null,
      }))
      .filter((row) => Number.isFinite(row.external_driver_id) && Number.isFinite(row.finish_position) && row.finish_position > 0)
      .sort((a, b) => a.finish_position - b.finish_position);

    if (!rows.length) {
      throw new Error(`OpenF1 returned no classified results for session ${sessionKey}`);
    }

    return rows;
  }

  getStatus() {
    return {
      provider: this.name,
      baseUrl: this.baseUrl,
    };
  }
}

module.exports = {
  OpenF1ResultsProvider,
  buildEventName,
  normalizeSessionType,
  canonicalGrandPrixName,
};
