const Anthropic = require('@anthropic-ai/sdk');

let client = null;

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

function dollars(cents) {
  return Math.round(Number(cents || 0) / 100);
}

function formatSigned(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 'N/A';
  return `${num > 0 ? '+' : ''}${num}`;
}

function determineBriefingPhase({ primaryEvent, liveSession }) {
  if (liveSession?.isLive || primaryEvent?.isLive) return 'live';
  if (primaryEvent?.dashboardStatus === 'Next up') return 'pre_race';
  return 'post_race';
}

function describeStandingsWindow({ standings, viewerId }) {
  const rows = Array.isArray(standings) ? standings : [];
  const index = rows.findIndex((row) => Number(row.id) === Number(viewerId));
  if (index < 0) return 'Viewer is not currently in the standings table.';

  return rows
    .slice(Math.max(0, index - 1), Math.min(rows.length, index + 2))
    .map((row, offset) => {
      const rank = Math.max(1, index + offset);
      const net = Number(row.total_earned_cents || 0) - Number(row.total_spent_cents || 0);
      return `P${rank} ${row.name}: earned ${dollars(row.total_earned_cents)} dollars, spent ${dollars(row.total_spent_cents)} dollars, net ${dollars(net)} dollars, drivers ${Number(row.drivers_owned || 0)}`;
    })
    .join('\n');
}

function describeOwnedDrivers(portfolio) {
  const drivers = Array.isArray(portfolio?.drivers) ? portfolio.drivers : [];
  if (!drivers.length) return 'No owned drivers.';

  return drivers
    .slice(0, 8)
    .map((driver) => {
      const live = driver.live || {};
      const liveParts = [];
      if (live.position != null) liveParts.push(`P${live.position}`);
      if (live.positionsGained != null) liveParts.push(`${formatSigned(live.positionsGained)} from grid`);
      if (live.maxPitStopSeconds != null) liveParts.push(`slowest pit ${Number(live.maxPitStopSeconds).toFixed(2)}s`);
      return `${driver.driver_name} (${driver.driver_code}) - purchase ${dollars(driver.purchase_price_cents)} dollars, earned ${dollars(driver.total_earnings_cents)} dollars${liveParts.length ? `, live ${liveParts.join(', ')}` : ''}`;
    })
    .join('\n');
}

function describePayoutBoard(payoutBoard) {
  const rules = Array.isArray(payoutBoard?.rules) ? payoutBoard.rules : [];
  if (!rules.length) return 'No active payout categories.';

  return rules
    .slice(0, 10)
    .map((rule) => {
      const holders = (rule.holders || []).map((holder) => {
        const owner = holder.participantName || 'Unowned';
        const yours = holder.isViewerOwner ? ', viewer-owned' : '';
        const value = holder.displayValue ? ` (${holder.displayValue})` : '';
        return `${holder.driverName || holder.driverCode || 'Driver'} for ${owner}${yours}${value}`;
      });
      return `${rule.label}: ${rule.status}${holders.length ? ` -> ${holders.join('; ')}` : ''}`;
    })
    .join('\n');
}

function extractJsonBlock(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const match = raw.match(/\{[\s\S]*\}/);
  return match ? match[0] : raw;
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

function composeText(summary, sections) {
  const lines = [String(summary || '').trim()];
  normalizeSections(sections).forEach((section) => {
    if (section.heading) lines.push(`${section.heading}:`);
    section.bullets.forEach((bullet) => lines.push(`- ${bullet}`));
  });
  return lines.filter(Boolean).join('\n');
}

function normalizeBriefingPayload(payload, phase) {
  const normalizedPhase = String(payload?.phase || phase || 'unknown').trim() || 'unknown';
  const title = String(payload?.title || '').trim()
    || (normalizedPhase === 'pre_race' ? 'Pre-race Outlook' : normalizedPhase === 'live' ? 'Live Race Readout' : 'Post-race Recap');
  const summary = String(payload?.summary || '').trim();
  const sections = normalizeSections(payload?.sections);

  return {
    phase: normalizedPhase,
    title,
    summary,
    sections,
    text: composeText(summary, sections),
  };
}

function fallbackBriefingFromText(rawText, phase) {
  const cleaned = String(rawText || '').trim();
  return normalizeBriefingPayload({
    phase,
    title: phase === 'pre_race' ? 'Pre-race Outlook' : phase === 'live' ? 'Live Race Readout' : 'Post-race Recap',
    summary: cleaned.split('\n').find(Boolean) || 'Structured briefing unavailable.',
    sections: [
      {
        heading: 'Your Position',
        bullets: cleaned ? [cleaned] : ['Structured briefing unavailable.'],
      },
      {
        heading: 'Scenarios',
        bullets: ['If the briefing format is incomplete, use the live payout board and standings to confirm the current swing points.'],
      },
      {
        heading: 'What To Watch',
        bullets: ['Refresh the briefing again after a meaningful race-state change if you need a cleaner structured readout.'],
      },
    ],
  }, phase);
}

async function generateDashboardBriefing({
  viewer,
  summary,
  primaryEvent,
  liveSession,
  standings,
  portfolio,
  payoutBoard,
}) {
  const anthropic = getClient();
  if (!anthropic) {
    return {
      available: false,
      text: '',
      generatedAt: null,
      source: 'disabled',
      error: 'Anthropic is not configured.',
    };
  }

  const phase = determineBriefingPhase({ primaryEvent, liveSession });
  const phaseTone = phase === 'pre_race'
    ? 'Sound anticipatory and tactical. Focus on setup, exposure, and what could move during the upcoming race.'
    : phase === 'live'
      ? 'Sound urgent and tactical. Focus on live swings, immediate threats, and current leverage.'
      : 'Sound reflective and outcome-focused. Explain what happened and how it affected the participant.';

  const prompt = `You are writing a structured F1 Calcutta dashboard briefing for one participant in a private pool.
Return JSON only. No markdown fences.

The JSON schema:
{
  "phase": "pre_race" | "live" | "post_race",
  "title": "short heading",
  "summary": "one short sentence",
  "sections": [
    { "heading": "Your Position", "bullets": ["...", "..."] },
    { "heading": "Scenarios", "bullets": ["If ...", "If ..."] },
    { "heading": "What To Watch", "bullets": ["...", "..."] }
  ]
}

Requirements:
- Keep it readable and compact.
- Use exactly 3 sections in this order: Your Position, Scenarios, What To Watch.
- Each section must have 2 bullets maximum.
- Every bullet must be one sentence.
- The Scenarios section must use explicit scenario language starting with "If".
- Personalize it to the viewer and connect live/payout context to standings impact.
- ${phaseTone}

Viewer:
- Name: ${viewer?.name || 'Participant'}
- Rank: ${summary?.rank ?? 'N/A'}
- Earned: ${dollars(summary?.totalEarnedCents)} dollars
- Spent: ${dollars(summary?.totalSpentCents)} dollars
- Net: ${dollars(summary?.netCents)} dollars

Primary event:
- Name: ${primaryEvent?.name || 'No event selected'}
- Type: ${primaryEvent?.type || 'unknown'}
- Dashboard status: ${primaryEvent?.dashboardStatus || 'unknown'}
- Event start: ${primaryEvent?.starts_at || 'TBD'}
- Briefing phase to use: ${phase}

Live session:
- Is live: ${liveSession?.isLive ? 'yes' : 'no'}
- Track status: ${liveSession?.trackStatus?.label || liveSession?.statusText || 'N/A'}
- Headline: ${liveSession?.headline || 'N/A'}

Standings around viewer:
${describeStandingsWindow({ standings, viewerId: viewer?.id })}

Owned drivers:
${describeOwnedDrivers(portfolio)}

Current payout board:
${describePayoutBoard(payoutBoard)}
`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = String(message.content?.[0]?.text || '').trim();
    let normalized = null;

    try {
      const jsonText = extractJsonBlock(rawText);
      const parsed = jsonText ? JSON.parse(jsonText) : null;
      normalized = normalizeBriefingPayload(parsed, phase);
    } catch {
      normalized = fallbackBriefingFromText(rawText, phase);
    }

    return {
      available: true,
      ...normalized,
      generatedAt: new Date().toISOString(),
      source: 'anthropic',
      error: null,
    };
  } catch (error) {
    return {
      available: false,
      text: '',
      generatedAt: null,
      source: 'error',
      error: error.message || 'Anthropic briefing failed.',
    };
  }
}

module.exports = {
  getClient,
  generateDashboardBriefing,
  determineBriefingPhase,
  normalizeBriefingPayload,
};
