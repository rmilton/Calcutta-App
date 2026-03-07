const {
  getEvents,
  getEventPayoutRules,
  getDrivers,
  getOwnership,
  getParticipantPortfolio,
  getSeasonParticipants,
  getStandings,
  getTotalPotCents,
} = require('../db');
const { dashboardBriefingService } = require('./dashboardBriefingService');
const { evaluateCategoryRule } = require('./payoutRuleResolvers');

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

function normalizeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function getRandomBonusPosition(event) {
  const num = normalizeNumber(event?.random_bonus_position);
  return num != null && num > 0 ? num : null;
}

function formatSignedValue(value) {
  const num = normalizeNumber(value);
  if (num == null) return null;
  return `${num > 0 ? '+' : ''}${num}`;
}

function formatMetricDisplay(metricKey, value) {
  const num = normalizeNumber(value);
  if (num == null) return null;

  switch (metricKey) {
    case 'finish_position':
    case 'best_finish_at_or_below':
      return `P${num}`;
    case 'positions_gained':
      return formatSignedValue(num);
    case 'slowest_pit_stop_seconds':
      return `${num.toFixed(2)}s`;
    default:
      return String(value);
  }
}

function buildLivePayoutRows({ liveSession, drivers }) {
  const driversByExternalId = new Map(
    (drivers || []).map((driver) => [Number(driver.external_id), driver]),
  );

  return (liveSession?.driverStates || [])
    .map((state) => {
      const externalDriverId = Number(state.external_driver_id);
      if (!Number.isFinite(externalDriverId)) return null;

      const seasonDriver = driversByExternalId.get(externalDriverId) || null;
      return {
        driver_id: seasonDriver?.id != null ? `driver:${seasonDriver.id}` : `external:${externalDriverId}`,
        season_driver_id: seasonDriver?.id != null ? Number(seasonDriver.id) : null,
        external_driver_id: externalDriverId,
        driver_code: state.driver_code || seasonDriver?.code || null,
        driver_name: state.driver_name || seasonDriver?.name || null,
        team_name: state.team_name || seasonDriver?.team_name || null,
        finish_position: normalizeNumber(state.position),
        positions_gained: normalizeNumber(state.positionsGained),
        slowest_pit_stop_seconds: normalizeNumber(state.slowestPitStopSeconds),
      };
    })
    .filter((row) => row && row.finish_position != null);
}

function buildHolderDisplayValue({ category, row }) {
  switch (category) {
    case 'race_winner':
    case 'sprint_winner':
    case 'second_place':
    case 'third_place':
    case 'best_p6_or_lower':
    case 'best_p11_or_lower':
    case 'random_finish_bonus':
      return row.finish_position != null ? `P${row.finish_position}` : null;
    case 'most_positions_gained':
      return formatSignedValue(row.positions_gained);
    case 'slowest_pit_stop':
      return formatMetricDisplay('slowest_pit_stop_seconds', row.slowest_pit_stop_seconds);
    default:
      return null;
  }
}

function buildRuleMetric(evaluation) {
  const metricKey = evaluation?.resolution?.metric || null;
  const value = evaluation?.resolution?.target_value;
  if (!metricKey || value == null) return null;

  return {
    key: metricKey,
    value,
    display: formatMetricDisplay(metricKey, value),
  };
}

function buildRuleStatus({ selectionState, liveSession, category, event }) {
  if (selectionState === 'upcoming') return 'pending';
  if (selectionState !== 'live') return 'unavailable';
  if (!liveSession?.available) return 'unavailable';
  if (category === 'random_finish_bonus' && getRandomBonusPosition(event) == null) {
    return 'draw_pending';
  }
  return 'live';
}

function buildRuleNote({ selectionState, liveSession, status, evaluation }) {
  if (status === 'pending') {
    return 'TBD until live timing data is available.';
  }
  if (status === 'draw_pending') {
    return 'Random finish target has not been drawn yet.';
  }
  if (status === 'unavailable') {
    if (selectionState === 'live') {
      return liveSession?.degradedReason || 'Live data is unavailable right now.';
    }
    return 'No active live scoring session.';
  }
  if (!evaluation?.winnerDriverIds?.length) {
    return 'No current holder yet.';
  }
  return evaluation?.resolution?.note || null;
}

function buildPayoutBoard({
  event,
  selectionState,
  liveSession,
  rules,
  liveRows,
  ownershipRows,
  viewerId,
}) {
  if (!event) {
    return {
      eventType: null,
      isLive: false,
      rules: [],
    };
  }

  const ownershipByDriverId = new Map(
    (ownershipRows || []).map((row) => [
      Number(row.driver_id),
      {
        participantId: Number(row.participant_id),
        participantName: row.owner_name,
        participantColor: row.owner_color,
      },
    ]),
  );
  const liveRowsByResolverId = new Map(
    (liveRows || []).map((row) => [row.driver_id, row]),
  );

  return {
    eventType: event.type,
    isLive: selectionState === 'live' && !!liveSession?.available,
    rules: (rules || []).map((rule) => {
      const status = buildRuleStatus({
        selectionState,
        liveSession,
        category: rule.category,
        event,
      });

      if (status !== 'live') {
        return {
          category: rule.category,
          label: rule.label,
          bps: Number(rule.bps || 0),
          status,
          holders: [],
          metric: status === 'draw_pending'
            ? {
                key: 'finish_position',
                value: null,
                display: 'Pending',
              }
            : null,
          note: buildRuleNote({ selectionState, liveSession, status, evaluation: null }),
        };
      }

      const evaluation = evaluateCategoryRule({
        category: rule.category,
        rows: liveRows,
        event,
        rankOrder: Number(rule.rank_order || 1),
      });

      const holders = (evaluation.winnerDriverIds || [])
        .map((resolverId) => liveRowsByResolverId.get(resolverId))
        .filter(Boolean)
        .map((row) => {
          const owner = row.season_driver_id != null
            ? ownershipByDriverId.get(Number(row.season_driver_id)) || null
            : null;

          return {
            driverId: row.season_driver_id,
            driverCode: row.driver_code,
            driverName: row.driver_name,
            teamName: row.team_name,
            participantId: owner?.participantId || null,
            participantName: owner?.participantName || null,
            participantColor: owner?.participantColor || null,
            isViewerOwner: owner ? Number(owner.participantId) === Number(viewerId) : false,
            displayValue: buildHolderDisplayValue({ category: rule.category, row }),
          };
        });

      return {
        category: rule.category,
        label: rule.label,
        bps: Number(rule.bps || 0),
        status,
        holders,
        metric: buildRuleMetric(evaluation),
        note: buildRuleNote({ selectionState, liveSession, status, evaluation }),
      };
    }),
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
  const [drivers, ownershipRows, eventRules] = await Promise.all([
    Promise.resolve(getDrivers(seasonId)),
    Promise.resolve(getOwnership(seasonId)),
    selection.event ? Promise.resolve(getEventPayoutRules(seasonId, selection.event.type)) : Promise.resolve([]),
  ]);

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

  const payoutBoard = buildPayoutBoard({
    event: selection.event,
    selectionState: selection.state,
    liveSession,
    rules: eventRules,
    liveRows: buildLivePayoutRows({ liveSession, drivers }),
    ownershipRows,
    viewerId: viewer.id,
  });

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
    payoutBoard,
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
