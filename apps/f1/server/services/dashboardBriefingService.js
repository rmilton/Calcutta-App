const crypto = require('crypto');
const { generateDashboardBriefing, phaseLabel } = require('../ai');
const {
  getDashboardBriefingHistory,
  getLatestDashboardBriefing,
  saveDashboardBriefing,
} = require('../db');

const DEFAULT_TTL_MS = 30 * 60 * 1000;

function hashPayload(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload || {})).digest('hex');
}

function normalizeSections(sections) {
  if (!Array.isArray(sections)) return [];
  return sections
    .map((section) => ({
      heading: String(section?.heading || '').trim(),
      bullets: Array.isArray(section?.bullets)
        ? section.bullets.map((bullet) => String(bullet || '').trim()).filter(Boolean).slice(0, 4)
        : [],
    }))
    .filter((section) => section.heading || section.bullets.length);
}

function firstSectionBullet(sections, heading) {
  const match = normalizeSections(sections)
    .find((section) => String(section.heading || '').trim().toLowerCase() === heading);
  return String(match?.bullets?.[0] || '').trim();
}

function stripExecutiveLead(text, leads = []) {
  let value = String(text || '').trim();
  if (!value) return '';

  leads.forEach((lead) => {
    const escaped = String(lead || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!escaped) return;
    value = value.replace(new RegExp(`^${escaped}\\s*[:\\-]\\s*`, 'i'), '').trim();
  });

  return value;
}

function normalizeExecutiveContent(content, row = null) {
  const summary = String(content?.summary || row?.briefing_summary || '').trim();
  const sections = normalizeSections(content?.sections);
  const bestReturnPath = stripExecutiveLead(
    content?.bestReturnPath || content?.best_return_path || content?.financialSnapshot || content?.financial_snapshot,
    ['best return path', 'best swing', 'financial snapshot'],
  )
    || firstSectionBullet(sections, 'your position');
  const capitalAtRisk = stripExecutiveLead(
    content?.capitalAtRisk || content?.capital_at_risk || content?.whatMattersNow || content?.what_matters_now,
    ['capital at risk', 'main risk', 'what matters now'],
  )
    || firstSectionBullet(sections, 'what to watch')
    || firstSectionBullet(sections, 'scenarios');

  return {
    summary,
    headline: stripExecutiveLead(content?.headline || summary, ['headline', 'summary']) || summary,
    bestReturnPath,
    capitalAtRisk,
    sections,
  };
}

function composeBriefingText(content) {
  const executive = normalizeExecutiveContent(content);
  const lines = [];

  if (executive.headline) lines.push(executive.headline);
  if (executive.bestReturnPath) lines.push(`Best Return Path: ${executive.bestReturnPath}`);
  if (executive.capitalAtRisk) lines.push(`Capital At Risk: ${executive.capitalAtRisk}`);

  if (!lines.length) {
    executive.sections.forEach((section) => {
      if (section.heading) lines.push(`${section.heading}:`);
      section.bullets.forEach((bullet) => lines.push(`- ${bullet}`));
    });
  }

  return lines.filter(Boolean).join('\n').trim();
}

function normalizeSavedBriefing(row) {
  if (!row?.briefing_json && !row?.briefing_text) return null;

  let content = null;
  try {
    content = row?.briefing_json ? JSON.parse(row.briefing_json) : null;
  } catch {
    content = null;
  }

  if (!content) {
    const legacyText = String(row?.briefing_text || '').trim();
    content = {
      summary: legacyText,
      sections: legacyText ? [{ heading: 'Saved Briefing', bullets: [legacyText] }] : [],
    };
  }

  const executive = normalizeExecutiveContent(content, row);
  const title = String(row?.briefing_title || '').trim() || (row?.event_name ? row.event_name : 'Dashboard Briefing');

  return {
    id: row.id || null,
    available: true,
    title,
    headline: executive.headline,
    summary: executive.headline || executive.summary,
    bestReturnPath: executive.bestReturnPath,
    capitalAtRisk: executive.capitalAtRisk,
    financialSnapshot: executive.bestReturnPath,
    whatMattersNow: executive.capitalAtRisk,
    sections: executive.sections,
    phase: row.briefing_phase || 'unknown',
    phaseLabel: phaseLabel(row.briefing_phase),
    text: composeBriefingText(executive),
    generatedAt: row.generated_at || null,
    source: row.source || 'persisted',
    error: null,
    cached: true,
    snapshotHash: row.snapshot_hash || '',
    persisted: true,
    eventId: row.event_id || null,
    eventName: row.event_name || null,
    eventType: row.event_type || null,
    eventStartsAt: row.event_starts_at || null,
  };
}

function createDashboardBriefingService({
  generator = generateDashboardBriefing,
  ttlMs = DEFAULT_TTL_MS,
  nowImpl = Date.now,
  loadSavedHistory = getDashboardBriefingHistory,
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
      weekendContext: dashboardPayload?.weekendContext
        ? {
            phase: dashboardPayload.weekendContext.phase || null,
            title: dashboardPayload.weekendContext.title || null,
            meetingName: dashboardPayload.weekendContext.meetingName || null,
            currentSessionName: dashboardPayload.weekendContext.currentSessionName || null,
            nextSessionName: dashboardPayload.weekendContext.nextSessionName || null,
            lastCompletedSessionName: dashboardPayload.weekendContext.lastCompletedSessionName || null,
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
              maxPitStopSeconds: driver.maxPitStopSeconds ?? null,
            })),
          }
        : null,
      payoutBoard: {
        eventType: dashboardPayload?.payoutBoard?.eventType || null,
        rules: (dashboardPayload?.payoutBoard?.rules || []).slice(0, 8).map((rule) => ({
          category: rule.category,
          status: rule.status,
          holders: (rule.holders || []).slice(0, 4).map((holder) => ({
            driverId: holder.driverId ?? null,
            participantId: holder.participantId ?? null,
            isViewerOwner: !!holder.isViewerOwner,
            displayValue: holder.displayValue || null,
          })),
        })),
      },
      standings: (dashboardPayload?.standings || []).slice(0, 8).map((row) => ({
        id: row.id,
        name: row.name,
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
              purchase_price_cents: driver.purchase_price_cents,
              total_earnings_cents: driver.total_earnings_cents,
              live: driver.live
                ? {
                    position: driver.live.position ?? null,
                    positionsGained: driver.live.positionsGained ?? null,
                    lastPitStopSeconds: driver.live.lastPitStopSeconds ?? null,
                    maxPitStopSeconds: driver.live.maxPitStopSeconds ?? null,
                  }
                : null,
            })),
          }
        : null,
    };
  }

  function getCacheKey({ viewerId, eventId, snapshotHash }) {
    return `${viewerId || 'anon'}:${eventId || 'none'}:${snapshotHash || 'empty'}`;
  }

  function getSavedBriefing({ seasonId, participantId }) {
    return normalizeSavedBriefing(loadSavedBriefing(seasonId, participantId));
  }

  function getBriefingHistory({ seasonId, participantId, limit = 12 }) {
    return (loadSavedHistory(seasonId, participantId, { limit }) || [])
      .map(normalizeSavedBriefing)
      .filter(Boolean);
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
          value: { ...saved },
        });
        return saved;
      }
    }

    const briefing = await generator({
      viewer: dashboardPayload?.viewer || null,
      summary: dashboardPayload?.summary || null,
      primaryEvent: dashboardPayload?.primaryEvent || null,
      weekendContext: dashboardPayload?.weekendContext || null,
      liveSession: dashboardPayload?.liveSession || null,
      standings: dashboardPayload?.standings || [],
      portfolio: dashboardPayload?.portfolio || null,
      payoutBoard: dashboardPayload?.payoutBoard || null,
    });

    const value = {
      available: !!briefing?.available,
      id: briefing?.id || null,
      title: briefing?.title || '',
      headline: briefing?.headline || briefing?.summary || '',
      summary: briefing?.summary || briefing?.headline || '',
      bestReturnPath: briefing?.bestReturnPath || briefing?.financialSnapshot || '',
      capitalAtRisk: briefing?.capitalAtRisk || briefing?.whatMattersNow || '',
      financialSnapshot: briefing?.bestReturnPath || briefing?.financialSnapshot || '',
      whatMattersNow: briefing?.capitalAtRisk || briefing?.whatMattersNow || '',
      sections: normalizeSections(briefing?.sections),
      phase: briefing?.phase || 'unknown',
      phaseLabel: phaseLabel(briefing?.phase),
      text: briefing?.text || composeBriefingText({
        headline: briefing?.headline || briefing?.summary || '',
        summary: briefing?.summary || briefing?.headline || '',
        bestReturnPath: briefing?.bestReturnPath || briefing?.financialSnapshot || '',
        capitalAtRisk: briefing?.capitalAtRisk || briefing?.whatMattersNow || '',
        financialSnapshot: briefing?.bestReturnPath || briefing?.financialSnapshot || '',
        whatMattersNow: briefing?.capitalAtRisk || briefing?.whatMattersNow || '',
        sections: briefing?.sections || [],
      }),
      generatedAt: briefing?.generatedAt || null,
      source: briefing?.source || 'unknown',
      error: briefing?.error || null,
      eventId: dashboardPayload?.primaryEvent?.id || null,
      eventName: dashboardPayload?.primaryEvent?.name || null,
      eventType: dashboardPayload?.primaryEvent?.type || null,
      eventStartsAt: dashboardPayload?.primaryEvent?.starts_at || null,
    };

    cache.set(cacheKey, {
      expiresAt: now + ttlMs,
      value,
    });

    if (value.available && value.text) {
      persistBriefing(dashboardPayload?.seasonId, dashboardPayload?.viewer?.id, {
        eventId: dashboardPayload?.primaryEvent?.id || null,
        snapshotHash,
        phase: value.phase,
        title: value.title,
        summary: value.summary,
        content: {
          headline: value.headline,
          summary: value.summary,
          bestReturnPath: value.bestReturnPath,
          capitalAtRisk: value.capitalAtRisk,
          financialSnapshot: value.bestReturnPath,
          whatMattersNow: value.capitalAtRisk,
          sections: value.sections,
        },
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
    getBriefingHistory,
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
