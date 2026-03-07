const crypto = require('crypto');
const { generateDashboardBriefing } = require('../ai');
const {
  getLatestDashboardBriefing,
  saveDashboardBriefing,
} = require('../db');

const DEFAULT_TTL_MS = 30 * 60 * 1000;

function hashPayload(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload || {})).digest('hex');
}

function createDashboardBriefingService({
  generator = generateDashboardBriefing,
  ttlMs = DEFAULT_TTL_MS,
  nowImpl = Date.now,
  loadSavedBriefing = getLatestDashboardBriefing,
  persistBriefing = saveDashboardBriefing,
} = {}) {
  const cache = new Map();

  function buildSnapshot(dashboardPayload) {
    return {
      summary: dashboardPayload?.summary
        ? {
            rank: dashboardPayload.summary.rank ?? null,
            totalEarnedCents: dashboardPayload.summary.totalEarnedCents ?? null,
            totalSpentCents: dashboardPayload.summary.totalSpentCents ?? null,
            netCents: dashboardPayload.summary.netCents ?? null,
            totalPotCents: dashboardPayload.summary.totalPotCents ?? null,
            participantCount: dashboardPayload.summary.participantCount ?? null,
            primaryEventLabel: dashboardPayload.summary.primaryEventLabel ?? null,
          }
        : null,
      primaryEvent: dashboardPayload?.primaryEvent
        ? {
            id: dashboardPayload.primaryEvent.id ?? null,
            name: dashboardPayload.primaryEvent.name ?? null,
            type: dashboardPayload.primaryEvent.type ?? null,
            dashboardStatus: dashboardPayload.primaryEvent.dashboardStatus ?? null,
            isLive: !!dashboardPayload.primaryEvent.isLive,
          }
        : null,
      liveSession: dashboardPayload?.liveSession
        ? {
            isLive: !!dashboardPayload.liveSession.isLive,
            statusText: dashboardPayload.liveSession.statusText || null,
            trackStatus: dashboardPayload.liveSession.trackStatus?.label || null,
            leaders: (dashboardPayload.liveSession.leaders || []).slice(0, 5).map((driver) => ({
              external_driver_id: driver.external_driver_id ?? null,
              position: driver.position ?? null,
              positionsGained: driver.positionsGained ?? null,
            })),
            ownedDrivers: (dashboardPayload.liveSession.ownedDrivers || []).slice(0, 8).map((driver) => ({
              external_driver_id: driver.external_driver_id ?? null,
              position: driver.position ?? null,
              positionsGained: driver.positionsGained ?? null,
              lastPitStopSeconds: driver.lastPitStopSeconds ?? null,
            })),
          }
        : null,
      standings: (dashboardPayload?.standings || []).slice(0, 8).map((row) => ({
        id: row.id,
        total_earned_cents: row.total_earned_cents,
        total_spent_cents: row.total_spent_cents,
        drivers_owned: row.drivers_owned,
      })),
      portfolio: dashboardPayload?.portfolio
        ? {
            totalSpentCents: dashboardPayload.portfolio.totalSpentCents ?? null,
            totalEarnedCents: dashboardPayload.portfolio.totalEarnedCents ?? null,
            netCents: dashboardPayload.portfolio.netCents ?? null,
            drivers: (dashboardPayload.portfolio.drivers || []).slice(0, 8).map((driver) => ({
              driver_id: driver.driver_id,
              total_earnings_cents: driver.total_earnings_cents,
              live: driver.live
                ? {
                    position: driver.live.position ?? null,
                    positionsGained: driver.live.positionsGained ?? null,
                    lastPitStopSeconds: driver.live.lastPitStopSeconds ?? null,
                  }
                : null,
            })),
          }
        : null,
    };
  }

  function normalizeSavedBriefing(row) {
    if (!row?.briefing_text) return null;
    return {
      available: true,
      text: row.briefing_text,
      generatedAt: row.generated_at || null,
      source: row.source || 'persisted',
      error: null,
      cached: true,
      snapshotHash: row.snapshot_hash || '',
      persisted: true,
      eventId: row.event_id || null,
    };
  }

  function getCacheKey({ viewerId, eventId, snapshotHash }) {
    return `${viewerId || 'anon'}:${eventId || 'none'}:${snapshotHash || 'empty'}`;
  }

  function getSavedBriefing({ seasonId, participantId }) {
    return normalizeSavedBriefing(loadSavedBriefing(seasonId, participantId));
  }

  async function getBriefing({ dashboardPayload, force = false }) {
    const snapshot = buildSnapshot(dashboardPayload);
    const snapshotHash = hashPayload(snapshot);
    const cacheKey = getCacheKey({
      viewerId: dashboardPayload?.viewer?.id,
      eventId: dashboardPayload?.primaryEvent?.id,
      snapshotHash,
    });
    const now = nowImpl();

    if (!force) {
      const cached = cache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return {
          ...cached.value,
          cached: true,
          snapshotHash,
        };
      }

      const saved = getSavedBriefing({
        seasonId: dashboardPayload?.seasonId,
        participantId: dashboardPayload?.viewer?.id,
      });
      if (saved && saved.snapshotHash === snapshotHash) {
        cache.set(cacheKey, {
          expiresAt: now + ttlMs,
          value: {
            available: saved.available,
            text: saved.text,
            generatedAt: saved.generatedAt,
            source: saved.source,
            error: saved.error,
          },
        });
        return saved;
      }
    }

    const briefing = await generator({
      viewer: dashboardPayload?.viewer || null,
      summary: dashboardPayload?.summary || null,
      primaryEvent: dashboardPayload?.primaryEvent || null,
      liveSession: dashboardPayload?.liveSession || null,
      standings: dashboardPayload?.standings || [],
      portfolio: dashboardPayload?.portfolio || null,
    });

    const value = {
      available: !!briefing?.available,
      text: briefing?.text || '',
      generatedAt: briefing?.generatedAt || null,
      source: briefing?.source || 'unknown',
      error: briefing?.error || null,
    };

    cache.set(cacheKey, {
      expiresAt: now + ttlMs,
      value,
    });

    if (value.available && value.text) {
      persistBriefing(dashboardPayload?.seasonId, dashboardPayload?.viewer?.id, {
        eventId: dashboardPayload?.primaryEvent?.id || null,
        snapshotHash,
        text: value.text,
        source: value.source,
        generatedAt: value.generatedAt,
        updatedAt: now,
      });
    }

    return {
      ...value,
      cached: false,
      snapshotHash,
      persisted: value.available && !!value.text,
    };
  }

  function getMeta({ dashboardPayload }) {
    const snapshot = buildSnapshot(dashboardPayload);

    return {
      available: !!process.env.ANTHROPIC_API_KEY,
      snapshotHash: hashPayload(snapshot),
      ttlMs,
      mode: 'on_demand',
    };
  }

  return {
    buildSnapshot,
    getSavedBriefing,
    getBriefing,
    getMeta,
  };
}

const dashboardBriefingService = createDashboardBriefingService();

module.exports = {
  DEFAULT_TTL_MS,
  createDashboardBriefingService,
  dashboardBriefingService,
};
