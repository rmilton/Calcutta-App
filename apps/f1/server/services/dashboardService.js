const {
  getEvents,
  getParticipantPortfolio,
  getSeasonParticipants,
  getStandings,
  getTotalPotCents,
} = require('../db');
const { dashboardBriefingService } = require('./dashboardBriefingService');

const LIVE_CACHE_TTL_MS = 15_000;
const ACTIVE_SESSION_GRACE_MS = 20 * 60 * 1000;
const FALLBACK_SESSION_WINDOW_MS = 4 * 60 * 60 * 1000;

const liveSnapshotCache = new Map();

function toTimestampMs(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function isScoringEvent(event) {
  return event?.type === 'grand_prix' || event?.type === 'sprint';
}

function compareByRound(a, b) {
  return (Number(a?.round_number || 0) - Number(b?.round_number || 0))
    || ((a?.type === 'sprint' ? 0 : 1) - (b?.type === 'sprint' ? 0 : 1));
}

function formatDashboardStatus(selectionState) {
  if (selectionState === 'live') return 'Live now';
  if (selectionState === 'upcoming') return 'Next up';
  return 'Most recent';
}

function isSessionLive(session, now) {
  if (!session) return false;

  const startedAtMs = toTimestampMs(session.starts_at || session.date_start);
  const endedAtMs = toTimestampMs(session.ends_at || session.date_end);
  const status = String(session.session_status || session.status || '').trim().toLowerCase();

  if (status && /(finished|ended|complete|completed)/i.test(status)) return false;
  if (status && /(started|active|running|green|safety|red|yellow|virtual)/i.test(status)) return true;

  if (startedAtMs != null && endedAtMs != null) {
    return now >= startedAtMs && now <= (endedAtMs + ACTIVE_SESSION_GRACE_MS);
  }

  if (startedAtMs != null) {
    return now >= startedAtMs && now <= (startedAtMs + FALLBACK_SESSION_WINDOW_MS);
  }

  return false;
}

async function getCachedLiveSnapshot({ cacheKey, loader, now }) {
  const existing = liveSnapshotCache.get(cacheKey);
  if (existing?.value && existing.expiresAt > now) {
    return existing.value;
  }
  if (existing?.promise) {
    return existing.promise;
  }

  const promise = Promise.resolve()
    .then(loader)
    .then((value) => {
      liveSnapshotCache.set(cacheKey, {
        value,
        expiresAt: now + LIVE_CACHE_TTL_MS,
      });
      return value;
    })
    .catch((error) => {
      liveSnapshotCache.delete(cacheKey);
      throw error;
    });

  liveSnapshotCache.set(cacheKey, { promise, expiresAt: now + LIVE_CACHE_TTL_MS });
  return promise;
}

async function selectPrimaryEvent({ events, provider, now }) {
  const scoringEvents = (events || [])
    .filter(isScoringEvent)
    .slice()
    .sort(compareByRound);

  if (!scoringEvents.length) {
    return {
      event: null,
      state: 'none',
      session: null,
    };
  }

  const nextUpcoming = scoringEvents.find((event) => {
    const startsAtMs = toTimestampMs(event.starts_at);
    return startsAtMs != null && startsAtMs > now;
  }) || null;

  const mostRecent = scoringEvents
    .filter((event) => {
      const startsAtMs = toTimestampMs(event.starts_at);
      return startsAtMs != null && startsAtMs <= now;
    })
    .slice()
    .sort((a, b) => compareByRound(b, a))[0] || scoringEvents[0];

  if (provider?.name === 'openf1' && mostRecent?.external_event_id) {
    try {
      const session = await provider.fetchSessionMetadata(Number(mostRecent.external_event_id));
      if (isSessionLive(session, now)) {
        return {
          event: mostRecent,
          state: 'live',
          session,
        };
      }
    } catch {
      // If OpenF1 metadata fails, continue with schedule fallback.
    }
  }

  if (nextUpcoming) {
    return {
      event: nextUpcoming,
      state: 'upcoming',
      session: null,
    };
  }

  return {
    event: mostRecent,
    state: 'recent',
    session: null,
  };
}

function buildViewer(viewer) {
  return {
    id: viewer.id,
    name: viewer.name,
    color: viewer.color,
    isAdmin: !!viewer.is_admin,
  };
}

function buildStandingsSummary({ viewer, standings, totalPotCents, participantCount }) {
  const rankIndex = (standings || []).findIndex((row) => Number(row.id) === Number(viewer.id));
  const viewerStanding = rankIndex >= 0 ? standings[rankIndex] : null;
  const totalEarnedCents = Number(viewerStanding?.total_earned_cents || 0);
  const totalSpentCents = Number(viewerStanding?.total_spent_cents || 0);

  if (viewer.isAdmin) {
    return {
      totalPotCents,
      participantCount,
      primaryEventLabel: null,
      liveDataFreshnessSeconds: null,
    };
  }

  return {
    rank: rankIndex >= 0 ? rankIndex + 1 : null,
    totalEarnedCents,
    totalSpentCents,
    netCents: totalEarnedCents - totalSpentCents,
    driversOwned: Number(viewerStanding?.drivers_owned || 0),
    totalPotCents,
  };
}

function buildPortfolio({ viewer, standings, drivers }) {
  if (viewer.isAdmin) return null;

  const rankIndex = (standings || []).findIndex((row) => Number(row.id) === Number(viewer.id));
  const standing = rankIndex >= 0 ? standings[rankIndex] : null;
  const totalSpentCents = Number(standing?.total_spent_cents || 0);
  const totalEarnedCents = Number(standing?.total_earned_cents || 0);

  return {
    participantId: viewer.id,
    totalSpentCents,
    totalEarnedCents,
    netCents: totalEarnedCents - totalSpentCents,
    drivers: (drivers || []).map((driver) => ({
      ...driver,
      total_earnings_cents: Number(driver.event_earnings_cents || 0) + Number(driver.bonus_earnings_cents || 0),
      live: null,
    })),
  };
}

function applyLivePortfolioState(portfolio, liveSession) {
  if (!portfolio) return null;

  const byExternalId = new Map(
    (liveSession?.driverStates || []).map((driver) => [Number(driver.external_driver_id), driver]),
  );

  return {
    ...portfolio,
    drivers: (portfolio.drivers || []).map((driver) => {
      const live = byExternalId.get(Number(driver.driver_external_id)) || null;
      return {
        ...driver,
        live,
      };
    }),
  };
}

function buildPrimaryEvent(event, state, liveSession) {
  if (!event) return null;

  return {
    ...event,
    dashboardStatus: formatDashboardStatus(state),
    isLive: state === 'live',
    startsAtMs: toTimestampMs(event.starts_at),
    liveHeadline: liveSession?.headline || null,
    liveStatusText: liveSession?.statusText || null,
  };
}

function buildFallbackLiveState({ event, session, state, error }) {
  if (!event) {
    return {
      available: false,
      isLive: false,
      statusText: 'No scoring session available.',
      degradedReason: error || null,
      fetchedAt: new Date().toISOString(),
      leaders: [],
      ownedDrivers: [],
      championshipDrivers: [],
      driverStates: [],
      trackStatus: null,
      session: null,
    };
  }

  return {
    available: false,
    isLive: state === 'live',
    statusText: state === 'upcoming' ? 'Waiting for the next scoring session.' : 'Live race data is unavailable right now.',
    degradedReason: error || null,
    fetchedAt: new Date().toISOString(),
    leaders: [],
    ownedDrivers: [],
    championshipDrivers: [],
    driverStates: [],
    trackStatus: null,
    session: session || null,
  };
}

async function buildDashboardPayload({
  seasonId,
  viewer,
  provider,
  nowImpl = Date.now,
}) {
  const now = nowImpl();
  const [events, standings, totalPotCents, participants] = await Promise.all([
    Promise.resolve(getEvents(seasonId)),
    Promise.resolve(getStandings(seasonId)),
    Promise.resolve(getTotalPotCents(seasonId)),
    Promise.resolve(getSeasonParticipants(seasonId)),
  ]);

  const viewerShape = buildViewer(viewer);
  const rawPortfolio = viewerShape.isAdmin
    ? null
    : buildPortfolio({
        viewer: viewerShape,
        standings,
        drivers: getParticipantPortfolio(seasonId, viewer.id),
      });

  const selection = await selectPrimaryEvent({ events, provider, now });

  let liveSession = buildFallbackLiveState({
    event: selection.event,
    session: selection.session,
    state: selection.state,
    error: provider?.name === 'openf1' ? null : 'Live data is only available when the OpenF1 provider is active.',
  });

  if (selection.event?.external_event_id && provider?.name === 'openf1' && selection.state === 'live') {
    try {
      const sessionKey = Number(selection.event.external_event_id);
      const cacheKey = `session:${sessionKey}`;
      liveSession = await getCachedLiveSnapshot({
        cacheKey,
        now,
        loader: () => provider.fetchLiveSessionSnapshot({ event: selection.event }),
      });
    } catch (error) {
      liveSession = buildFallbackLiveState({
        event: selection.event,
        session: selection.session,
        state: selection.state,
        error: error.message || 'Live session data failed to load.',
      });
    }
  }

  const portfolio = applyLivePortfolioState(rawPortfolio, liveSession);
  if (portfolio && liveSession) {
    liveSession = {
      ...liveSession,
      ownedDrivers: (portfolio.drivers || [])
        .filter((driver) => !!driver.live)
        .map((driver) => ({
          ...driver.live,
          purchase_price_cents: driver.purchase_price_cents,
          total_earnings_cents: driver.total_earnings_cents,
        }))
        .sort((a, b) => (Number(a.position || 999) - Number(b.position || 999))),
    };
  }

  const summary = buildStandingsSummary({
    viewer: viewerShape,
    standings,
    totalPotCents,
    participantCount: (participants || []).filter((row) => !row.is_admin).length,
  });

  if (viewerShape.isAdmin) {
    summary.primaryEventLabel = selection.event?.name || null;
    summary.liveDataFreshnessSeconds = liveSession?.fetchedAt
      ? Math.max(0, Math.round((now - Date.parse(liveSession.fetchedAt)) / 1000))
      : null;
  }

  const payload = {
    seasonId,
    viewer: viewerShape,
    summary,
    standings,
    primaryEvent: buildPrimaryEvent(selection.event, selection.state, liveSession),
    liveSession,
    portfolio,
  };

  payload.briefingMeta = dashboardBriefingService.getMeta({ dashboardPayload: payload });
  return payload;
}

module.exports = {
  LIVE_CACHE_TTL_MS,
  selectPrimaryEvent,
  buildDashboardPayload,
  isSessionLive,
};
