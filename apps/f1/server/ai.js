const Anthropic = require('@anthropic-ai/sdk');

let client = null;

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

async function generateDashboardBriefing({
  viewer,
  summary,
  primaryEvent,
  liveSession,
  standings,
  portfolio,
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

  const topStandings = (standings || [])
    .slice(0, 5)
    .map((row, index) => {
      const net = Number(row.total_earned_cents || 0) - Number(row.total_spent_cents || 0);
      return `${index + 1}. ${row.name}: earned ${Math.round(Number(row.total_earned_cents || 0) / 100)} dollars, net ${Math.round(net / 100)} dollars`;
    })
    .join('\n');

  const ownedDrivers = (portfolio?.drivers || [])
    .slice(0, 6)
    .map((driver) => {
      const live = driver.live || {};
      const liveNote = live.position
        ? ` currently P${live.position}${live.positionsGained == null ? '' : `, ${live.positionsGained >= 0 ? '+' : ''}${live.positionsGained} from grid`}`
        : ' not currently classified live';
      return `${driver.driver_name} (${driver.driver_code})${liveNote}`;
    })
    .join('\n');

  const prompt = `You are writing a concise F1 Calcutta dashboard briefing for a participant in a friends-and-family pool.
Write exactly 3 short sentences.
Be specific, data-grounded, and useful. No hype, no bullet points, no markdown, no quotes.

Viewer: ${viewer?.name || 'Participant'}
Viewer rank: ${summary?.rank ?? 'N/A'}
Viewer earned: ${Math.round(Number(summary?.totalEarnedCents || 0) / 100)} dollars
Viewer spent: ${Math.round(Number(summary?.totalSpentCents || 0) / 100)} dollars
Viewer net: ${Math.round(Number(summary?.netCents || 0) / 100)} dollars

Primary event: ${primaryEvent?.name || 'No event selected'}
Event state: ${primaryEvent?.dashboardStatus || 'unknown'}
Event start: ${primaryEvent?.starts_at || 'TBD'}
Live session: ${liveSession?.isLive ? 'live' : 'not live'}
Track status: ${liveSession?.trackStatus?.label || liveSession?.statusText || 'N/A'}

Owned drivers:
${ownedDrivers || 'No owned drivers'}

Top standings:
${topStandings || 'No standings available'}

Respond with only the 3-sentence briefing.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 220,
      messages: [{ role: 'user', content: prompt }],
    });

    return {
      available: true,
      text: String(message.content?.[0]?.text || '').trim(),
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
};
