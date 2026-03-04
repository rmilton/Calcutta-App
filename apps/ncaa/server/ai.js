const Anthropic = require('@anthropic-ai/sdk');

const ROUND_NAMES = {
  1: 'Round of 64',
  2: 'Round of 32',
  3: 'Sweet 16',
  4: 'Elite 8',
  5: 'Final Four',
  6: 'Championship',
};

let _client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// Generates a fun 1-2 sentence sports-announcer quip after a team sells at auction.
// Emits: auction:commentary:chunk { token }, auction:commentary:done { text }
async function generateAuctionCommentary({
  teamName, seed, region, price,
  winnerName, winnerTotalSpent, winnerTeamCount,
  totalPot, teamsRemaining,
}, io) {
  const client = getClient();
  if (!client) return;

  const spendNote = winnerTeamCount > 1
    ? `${winnerName} has now spent $${winnerTotalSpent} across ${winnerTeamCount} teams.`
    : '';

  const prompt = `You are a charismatic sports announcer calling a live March Madness Calcutta auction for a group of friends. A team just sold. Write exactly 1-2 short, punchy sentences of color commentary. Be specific about the price and buyer. Keep it fun — like you're at a bar with friends.

JUST SOLD: #${seed} seed ${teamName} (${region} Region) to ${winnerName} for $${price}
Total pot: $${totalPot}
Teams remaining: ${teamsRemaining}
${spendNote}

Respond with only the commentary text. No quotes, no prefix.`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 120,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = message.content[0]?.text || '';
    io.emit('auction:commentary:chunk', { token: text });
    io.emit('auction:commentary:done', { text });
  } catch (e) {
    console.error('[AI auction]', e.message);
  }
}

// Generates an end-of-round recap with a per-team summary block.
// Emits: bracket:recap:chunk { token }, bracket:recap:done { text }
async function streamRoundRecap({
  roundNumber,
  teamSummaries, // [{ seed, teamName, ownerName, purchasePrice, outcome, roundEarnings }]
  standings,     // top array [{ name, total_earned, total_spent }]
  totalPot,
}, io) {
  const client = getClient();
  if (!client) return;

  const roundName = ROUND_NAMES[roundNumber] || `Round ${roundNumber}`;

  const standingsSummary = standings
    .slice(0, 8)
    .map((p, i) => `${i + 1}. ${p.name}: $${p.total_earned} earned, $${p.total_spent} spent`)
    .join('\n');

  const teamInput = (teamSummaries || []).map((t) => (
    `#${t.seed} ${t.teamName} | ${t.ownerName ? `${t.ownerName} (paid $${t.purchasePrice})` : 'Unowned'} | ${t.outcome}${t.roundEarnings > 0 ? ` | +$${t.roundEarnings}` : ''}`
  )).join('\n');

  const prompt = `You are a commentator for a small March Madness Calcutta pool among friends.
Write 2-3 conversational sentences about the completed ${roundName} from a money/standings perspective.
Be specific with names and dollar amounts.

Current standings (total pot $${totalPot}):
${standingsSummary}

Round team outcomes:
${teamInput}

Respond with only the 2-3 sentence intro text. No quotes, no prefix.`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 220,
      messages: [{ role: 'user', content: prompt }],
    });

    const intro = (message.content[0]?.text || '').trim();
    const perTeamSummary = (teamSummaries || []).map((t) => (
      `- #${t.seed} ${t.teamName} (${t.ownerName ? `${t.ownerName}, paid $${t.purchasePrice}` : 'Unowned'}) — ${t.outcome}${t.roundEarnings > 0 ? `, earned $${t.roundEarnings}` : ''}`
    )).join('\n');

    const text = `${intro}\n\n${roundName} Team Summary:\n${perTeamSummary}`.trim();
    io.emit('bracket:recap:chunk', { token: text });
    io.emit('bracket:recap:done', { text });
  } catch (e) {
    console.error('[AI recap]', e.message);
  }
}

async function generateAuctionCompletionSummary({
  participantSummaries, // [{ participantName, teamsOwned, totalSpent, avgSpend }]
  totalPot,
}) {
  const client = getClient();
  if (!client) return '';
  if (!Array.isArray(participantSummaries) || participantSummaries.length === 0) return '';

  const lines = participantSummaries.map((p) => (
    `${p.participantName}: spent $${p.totalSpent} on ${p.teamsOwned} team${p.teamsOwned === 1 ? '' : 's'} (avg $${p.avgSpend})`
  )).join('\n');

  const prompt = `You are recapping a March Madness Calcutta auction for a friend group.
Write a full-auction recap that is edgy, funny, and accurate. Keep it sharp, not corny and not overly punny.

Rules:
- Write exactly 1 short intro sentence.
- Then output exactly one bullet per participant using this format:
  - NAME — spent $X on Y teams: one concise, spicy but factual line
- Do not invent data.
- Keep each bullet to one sentence.
- No markdown headers.
- Keep the whole response brief.

Auction total pot: $${totalPot}
Participant results:
${lines}

Return only the recap text.`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    });
    return (message.content[0]?.text || '').trim();
  } catch (e) {
    console.error('[AI auction completion]', e.message);
    return '';
  }
}

module.exports = { generateAuctionCommentary, streamRoundRecap, generateAuctionCompletionSummary };
