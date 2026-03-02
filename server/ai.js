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

// Streams a fun 1-2 sentence sports-announcer quip after a team sells at auction.
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

  const stream = client.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 120,
    messages: [{ role: 'user', content: prompt }],
  });

  let fullText = '';
  for await (const text of stream.textStream) {
    fullText += text;
    io.emit('auction:commentary:chunk', { token: text });
  }
  io.emit('auction:commentary:done', { text: fullText });
}

// Streams a 2-3 sentence Calcutta-focused recap after a bracket game result.
// Emits: bracket:recap:chunk { token }, bracket:recap:done { text }
async function streamGameRecap({
  roundNumber,
  winnerTeam,  // { name, seed, region }
  loserTeam,   // { name, seed, region }
  winnerOwner, // { name, purchase_price } | null
  loserOwner,  // { name, purchase_price } | null
  earnings,    // dollars earned for this win (0 if no payout configured)
  standings,   // top-5 array [{ name, total_earned, total_spent }]
  totalPot,
}, io) {
  const client = getClient();
  if (!client) return;

  const roundName = ROUND_NAMES[roundNumber] || `Round ${roundNumber}`;

  const ownershipLines = [
    winnerOwner
      ? `${winnerTeam.name} is owned by ${winnerOwner.name} (paid $${winnerOwner.purchase_price} at auction)${earnings > 0 ? ` — earns $${earnings} for this win` : ''}.`
      : `${winnerTeam.name} is unowned — no one profits from this win.`,
    loserOwner
      ? `${loserTeam.name} was owned by ${loserOwner.name} (paid $${loserOwner.purchase_price}) — they're out.`
      : `${loserTeam.name} was unowned.`,
  ].join('\n');

  const standingsSummary = standings
    .slice(0, 5)
    .map((p, i) => `${i + 1}. ${p.name}: $${p.total_earned} earned, $${p.total_spent} spent`)
    .join('\n');

  const prompt = `You are a commentator for a small March Madness Calcutta pool among friends. Write 2-3 conversational sentences about this result from a Calcutta money perspective — who profits, who's hurting, any standings drama. Be specific with names and dollar amounts. Keep it tight.

${roundName}: #${winnerTeam.seed} ${winnerTeam.name} defeats #${loserTeam.seed} ${loserTeam.name}

${ownershipLines}

Current standings (total pot $${totalPot}):
${standingsSummary}

Respond with only the commentary. No quotes, no prefix.`;

  const stream = client.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 180,
    messages: [{ role: 'user', content: prompt }],
  });

  let fullText = '';
  for await (const text of stream.textStream) {
    fullText += text;
    io.emit('bracket:recap:chunk', { token: text });
  }
  io.emit('bracket:recap:done', { text: fullText });
}

module.exports = { generateAuctionCommentary, streamGameRecap };
