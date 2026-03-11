const Anthropic = require('@anthropic-ai/sdk');

const IMMEDIATE_POST_RACE_WINDOW_MS = 48 * 60 * 60 * 1000;
const MAX_EXECUTIVE_LINE_WORDS = 26;
const GENERIC_BRIEFING_PATTERNS = [
  /\bmonitor closely\b/i,
  /\bsecondary payouts?\b/i,
  /\bvalue picks?\b/i,
  /\bkeep an eye on\b/i,
  /\bopportunities\b/i,
  /\blive swings?\b/i,
];
const STANDINGS_HEAVY_PATTERNS = [
  /\bchase\b/i,
  /\bmove up\b/i,
  /\bclose the gap\b/i,
  /\bbehind [a-z]/i,
  /\bfor p\d+\b/i,
  /\bgap widens?\b/i,
];
const SUMMARY_METRIC_PATTERNS = [
  /\bearned\b/i,
  /\bspent\b/i,
  /\bnet\b/i,
];
const ROI_LANGUAGE_PATTERNS = [
  /\bjustify\b/i,
  /\boutperform\b/i,
  /\bbuy price\b/i,
  /\bcost basis\b/i,
  /\bpay back\b/i,
  /\blagging\b/i,
  /\breturn\b/i,
  /\bvalue\b/i,
  /\bcost\b/i,
];

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

function normalizePhaseKey(phase) {
  return String(phase || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function phaseLabel(phase) {
  switch (normalizePhaseKey(phase)) {
    case 'before_practice':
      return 'Before Practice';
    case 'during_practice':
      return 'During Practice';
    case 'before_qualifying':
      return 'Before Qualifying';
    case 'during_qualifying':
      return 'During Qualifying';
    case 'during_sprint_qualifying':
      return 'During Sprint Qualifying';
    case 'after_qualifying_before_race':
      return 'After Qualifying / Before Race';
    case 'during_race':
      return 'During Race';
    case 'during_sprint':
      return 'During Sprint';
    case 'immediate_post_race':
      return 'Immediate Post-Race';
    case 'between_races':
      return 'Between Races';
    case 'pre_race':
      return 'Pre-race';
    case 'live':
      return 'Live';
    case 'post_race':
      return 'Post-race';
    default:
      return 'Saved';
  }
}

function determineBriefingPhase({ primaryEvent, liveSession, weekendContext, now = Date.now() }) {
  if (weekendContext?.phase) return normalizePhaseKey(weekendContext.phase);

  if (liveSession?.isLive || primaryEvent?.isLive) {
    return primaryEvent?.type === 'sprint' ? 'during_sprint' : 'during_race';
  }

  const eventStartsAtMs = Date.parse(primaryEvent?.starts_at || '');
  if (Number.isFinite(eventStartsAtMs)) {
    if (eventStartsAtMs > now + IMMEDIATE_POST_RACE_WINDOW_MS) return 'before_practice';
    if (eventStartsAtMs > now) return 'before_qualifying';
    if (now - eventStartsAtMs <= IMMEDIATE_POST_RACE_WINDOW_MS) return 'immediate_post_race';
  }

  return 'between_races';
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
      const profit = dollars(driverProfitCents(driver));
      const roiMultiple = formatMultiple(driverRoiMultiple(driver));
      return `${driver.driver_name} (${driver.driver_code}) - purchase ${dollars(driver.purchase_price_cents)} dollars, earned ${dollars(driver.total_earnings_cents)} dollars, ${profit >= 0 ? 'profit' : 'loss'} ${Math.abs(profit)} dollars${roiMultiple ? `, return ${roiMultiple}` : ''}${liveParts.length ? `, live ${liveParts.join(', ')}` : ''}`;
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

function describeWeekendContext(weekendContext) {
  if (!weekendContext) return 'Weekend context unavailable.';

  return [
    `Visible phase label: ${phaseLabel(weekendContext.phase)}`,
    `Weekend title: ${weekendContext.title || weekendContext.meetingName || 'Unknown weekend'}`,
    `Current session: ${weekendContext.currentSessionName || 'None'}`,
    `Next session: ${weekendContext.nextSessionName || 'None'}`,
    `Last completed session: ${weekendContext.lastCompletedSessionName || 'None'}`,
    `Data source: ${weekendContext.source || 'unknown'}`,
  ].join('\n');
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

function firstBulletForHeading(sections, heading) {
  const match = normalizeSections(sections).find((section) => String(section.heading || '').trim().toLowerCase() === heading);
  return String(match?.bullets?.[0] || '').trim();
}

function deriveLegacyExecutiveFields(sections) {
  const normalizedSections = normalizeSections(sections);
  return {
    bestReturnPath: firstBulletForHeading(normalizedSections, 'your position')
      || firstBulletForHeading(normalizedSections, 'best swing')
      || firstBulletForHeading(normalizedSections, 'financial snapshot'),
    capitalAtRisk: firstBulletForHeading(normalizedSections, 'what to watch')
      || firstBulletForHeading(normalizedSections, 'main risk')
      || firstBulletForHeading(normalizedSections, 'what matters now')
      || firstBulletForHeading(normalizedSections, 'scenarios'),
  };
}

function computeNetCents(row) {
  return Number(row?.total_earned_cents || 0) - Number(row?.total_spent_cents || 0);
}

function buildPositionContext({ standings, viewerId }) {
  const rows = Array.isArray(standings) ? standings : [];
  const viewerIndex = rows.findIndex((row) => Number(row.id) === Number(viewerId));
  const viewerRow = viewerIndex >= 0 ? rows[viewerIndex] : null;
  const aboveRow = viewerIndex > 0 ? rows[viewerIndex - 1] : null;
  const belowRow = viewerIndex >= 0 && viewerIndex < (rows.length - 1) ? rows[viewerIndex + 1] : null;
  const viewerRank = viewerIndex >= 0 ? viewerIndex + 1 : null;
  const gapToAbove = aboveRow && viewerRow ? Math.abs(dollars(computeNetCents(viewerRow) - computeNetCents(aboveRow))) : null;
  const leadToBelow = belowRow && viewerRow ? Math.abs(dollars(computeNetCents(viewerRow) - computeNetCents(belowRow))) : null;

  return {
    viewerRank,
    aboveRow,
    belowRow,
    gapToAbove,
    leadToBelow,
  };
}

function topOwnedDrivers(portfolio, limit = 3) {
  return (Array.isArray(portfolio?.drivers) ? portfolio.drivers : [])
    .slice()
    .sort((a, b) => (
      Number(b.total_earnings_cents || 0) - Number(a.total_earnings_cents || 0)
    ) || (
      Number(b.purchase_price_cents || 0) - Number(a.purchase_price_cents || 0)
    ))
    .slice(0, limit)
    .map((driver) => driver.driver_name || driver.driver_code)
    .filter(Boolean);
}

function driverProfitCents(driver) {
  return Number(driver?.total_earnings_cents || 0) - Number(driver?.purchase_price_cents || 0);
}

function driverRoiMultiple(driver) {
  const spend = Number(driver?.purchase_price_cents || 0);
  if (spend <= 0) return null;
  return Number(driver?.total_earnings_cents || 0) / spend;
}

function returnCandidateDrivers(portfolio, limit = 2) {
  return (Array.isArray(portfolio?.drivers) ? portfolio.drivers : [])
    .slice()
    .sort((a, b) => {
      const roiDiff = (driverRoiMultiple(b) ?? -Infinity) - (driverRoiMultiple(a) ?? -Infinity);
      if (roiDiff !== 0) return roiDiff;
      const profitDiff = driverProfitCents(b) - driverProfitCents(a);
      if (profitDiff !== 0) return profitDiff;
      return Number(a.purchase_price_cents || 0) - Number(b.purchase_price_cents || 0);
    })
    .slice(0, limit);
}

function riskDrivers(portfolio, limit = 2) {
  return (Array.isArray(portfolio?.drivers) ? portfolio.drivers : [])
    .slice()
    .sort((a, b) => {
      const underperformanceA = Number(a.purchase_price_cents || 0) - Number(a.total_earnings_cents || 0);
      const underperformanceB = Number(b.purchase_price_cents || 0) - Number(b.total_earnings_cents || 0);
      if (underperformanceB !== underperformanceA) return underperformanceB - underperformanceA;
      return Number(b.purchase_price_cents || 0) - Number(a.purchase_price_cents || 0);
    })
    .slice(0, limit);
}

function formatMultiple(value) {
  if (!Number.isFinite(value)) return null;
  return `${value.toFixed(value >= 2 ? 1 : 2)}x`;
}

function payoutSignals({ payoutBoard, rivalNames }) {
  const rules = Array.isArray(payoutBoard?.rules) ? payoutBoard.rules : [];
  const viewerRules = [];
  const rivalRules = [];
  const activeRules = [];

  rules.forEach((rule) => {
    const label = String(rule?.label || '').trim();
    if (!label) return;
    activeRules.push(label);
    if ((rule.holders || []).some((holder) => holder.isViewerOwner)) viewerRules.push(label);
    if ((rule.holders || []).some((holder) => rivalNames.includes(holder.participantName))) rivalRules.push(label);
  });

  return {
    viewerRules: [...new Set(viewerRules)],
    rivalRules: [...new Set(rivalRules)],
    activeRules: [...new Set(activeRules)],
  };
}

function buildDeterministicTitle({ primaryEvent, weekendContext }) {
  const base = String(
    weekendContext?.title
    || weekendContext?.meetingName
    || primaryEvent?.name
    || 'Dashboard Briefing',
  ).trim() || 'Dashboard Briefing';

  return `${base} - Return Outlook`;
}

function defaultHeadlineForPhase(phase) {
  switch (normalizePhaseKey(phase)) {
    case 'before_practice':
      return 'Your return outlook is waiting on the first real pace signal of the weekend.';
    case 'during_practice':
      return 'Practice is starting to show which parts of your portfolio can justify their buy prices.';
    case 'before_qualifying':
      return 'Qualifying is the next inflection point for which drivers can outperform their cost this weekend.';
    case 'during_qualifying':
    case 'during_sprint_qualifying':
      return 'Qualifying is actively deciding whose weekend value can beat the purchase price.';
    case 'after_qualifying_before_race':
      return 'The grid is set, so race execution now decides which buys can pay back.';
    case 'during_race':
    case 'during_sprint':
      return 'Live running is actively changing which drivers are paying back their cost.';
    case 'immediate_post_race':
      return 'The race has just finished, so the focus is which buys paid back and which did not.';
    case 'between_races':
      return 'Between races, the focus shifts to which drivers are most likely to deliver the next surplus return.';
    default:
      return 'Executive summary unavailable.';
  }
}

function defaultBestReturnPath(phase) {
  switch (normalizePhaseKey(phase)) {
    case 'during_practice':
      return 'The best return path will come from the owned driver showing live pace without needing a premium finish to justify the spend.';
    case 'during_qualifying':
    case 'during_sprint_qualifying':
      return 'The cleanest return path is the owned driver who can turn grid position into a payout that beats the buy price.';
    case 'during_race':
    case 'during_sprint':
      return 'The clearest return path is the owned driver still live for a payout category that can pay back the ticket price.';
    default:
      return 'The best return path will come from the owned driver with the clearest route to outperform the buy price this weekend.';
  }
}

function defaultCapitalAtRisk(phase) {
  switch (normalizePhaseKey(phase)) {
    case 'before_practice':
      return 'The main capital risk is any premium spend that arrives at the weekend without a clear path to paying back.';
    case 'during_practice':
      return 'The main capital risk is any expensive driver whose pace still looks too thin to justify the buy price.';
    case 'before_qualifying':
      return 'The main capital risk is any premium buy that needs a strong grid slot and does not get one.';
    case 'during_qualifying':
    case 'during_sprint_qualifying':
      return 'The main capital risk is any expensive driver losing grid position and with it the clearest payout routes.';
    case 'after_qualifying_before_race':
      return 'The main capital risk is any premium buy starting too far back to pay back without race chaos or attrition.';
    case 'during_race':
    case 'during_sprint':
      return 'The main capital risk is any expensive ticket falling out of the payout windows while the laps run down.';
    case 'immediate_post_race':
      return 'The main capital risk now is carrying premium buys that still have not justified what you paid.';
    case 'between_races':
      return 'The main capital risk between races is concentrated spend that still needs a clean weekend to pay back.';
    default:
      return 'Refresh after the next material session change for a clearer read.';
  }
}

function normalizeCompareText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsOneOf(text, values) {
  const haystack = normalizeCompareText(text);
  return values.some((value) => {
    const needle = normalizeCompareText(value);
    return needle && haystack.includes(needle);
  });
}

function countWords(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
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

function buildDeterministicExecutiveBriefing({
  viewer,
  summary,
  standings,
  portfolio,
  payoutBoard,
  primaryEvent,
  weekendContext,
  phase,
}) {
  const { viewerRank, aboveRow, belowRow, gapToAbove, leadToBelow } = buildPositionContext({
    standings,
    viewerId: viewer?.id,
  });
  const returnDrivers = returnCandidateDrivers(portfolio, 2);
  const riskPool = riskDrivers(portfolio, 2);
  const driverNames = topOwnedDrivers(portfolio, 3);
  const rivalNames = [aboveRow?.name, belowRow?.name].filter(Boolean);
  const { viewerRules, rivalRules, activeRules } = payoutSignals({ payoutBoard, rivalNames });
  const leadDriver = returnDrivers[0]?.driver_name || returnDrivers[0]?.driver_code || driverNames[0] || 'your top driver';
  const supportDriver = returnDrivers[1]?.driver_name || returnDrivers[1]?.driver_code || null;
  const riskDriver = riskPool[0]?.driver_name || riskPool[0]?.driver_code || driverNames[0] || 'your priciest driver';
  const targetName = aboveRow?.name || null;
  const leadRoi = formatMultiple(driverRoiMultiple(returnDrivers[0]));
  const riskProfit = dollars(driverProfitCents(riskPool[0]));

  let headline = defaultHeadlineForPhase(phase);
  if (leadDriver && supportDriver) {
    headline = `Your return outlook for ${weekendContext?.title || primaryEvent?.name || 'this session'} hinges on ${leadDriver} validating the premium spend and ${supportDriver} delivering surplus value.`;
  } else if (leadDriver && leadRoi) {
    headline = `${leadDriver} is carrying the strongest ${leadRoi} return signal in your portfolio heading into ${weekendContext?.title || primaryEvent?.name || 'this session'}.`;
  } else if (leadDriver) {
    headline = `${leadDriver} is your clearest route to portfolio value in ${weekendContext?.title || primaryEvent?.name || 'this session'}.`;
  }

  let bestReturnPath = defaultBestReturnPath(phase);
  if (viewerRules.length) {
    bestReturnPath = `${leadDriver}${supportDriver ? ` plus ${supportDriver}` : ''} is your best value path if ${viewerRules[0]}${viewerRules[1] ? ` or ${viewerRules[1]}` : ''} pays back the buy price.`;
  } else if (activeRules.length) {
    bestReturnPath = `${leadDriver}${supportDriver ? ` plus ${supportDriver}` : ''} is your cleanest over-performance path if ${activeRules[0]}${activeRules[1] ? ` or ${activeRules[1]}` : ''} lands.`;
  }

  let capitalAtRisk = defaultCapitalAtRisk(phase);
  if (targetName && rivalRules.length) {
    capitalAtRisk = `${riskDriver} is your most exposed spend if ${targetName} locks down ${rivalRules[0]} and squeezes the payout path you need.`;
  } else if (riskDriver && Number.isFinite(riskProfit) && riskProfit < 0) {
    capitalAtRisk = `${riskDriver} is still ${Math.abs(riskProfit)} dollars short of paying back the ticket, so another quiet session leaves that spend lagging its cost.`;
  } else if (riskDriver) {
    capitalAtRisk = `${riskDriver} is your most exposed spend because it still needs a clean payout hit to justify the buy price.`;
  }

  return normalizeBriefingPayload({
    headline,
    bestReturnPath,
    capitalAtRisk,
  }, {
    phase,
    title: buildDeterministicTitle({
      primaryEvent,
      weekendContext,
    }),
    summaryData: summary,
    primaryEvent,
    weekendContext,
  });
}

function scoreExecutiveBriefing(briefing, {
  viewer,
  standings,
  portfolio,
  payoutBoard,
} = {}) {
  const lines = [briefing?.headline, briefing?.bestReturnPath, briefing?.capitalAtRisk]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const normalizedLines = lines.map(normalizeCompareText).filter(Boolean);
  const driverNames = topOwnedDrivers(portfolio, 4);
  const { aboveRow, belowRow } = buildPositionContext({ standings, viewerId: viewer?.id });
  const rivalNames = [aboveRow?.name, belowRow?.name].filter(Boolean);
  const payoutLabels = payoutSignals({ payoutBoard, rivalNames }).activeRules;
  const combined = lines.join(' ');
  const competitorMentioned = containsOneOf(combined, rivalNames);
  const payoutMentioned = containsOneOf(combined, payoutLabels);
  const metricMentions = SUMMARY_METRIC_PATTERNS.filter((pattern) => pattern.test(combined)).length;
  const standingsHeavy = STANDINGS_HEAVY_PATTERNS.some((pattern) => pattern.test(combined));
  const hasRoiLanguage = ROI_LANGUAGE_PATTERNS.some((pattern) => pattern.test(combined));

  let score = 0;
  if (lines.length === 3) score += 1;
  if (new Set(normalizedLines).size === normalizedLines.length) score += 1;
  if (lines.every((line) => countWords(line) <= MAX_EXECUTIVE_LINE_WORDS)) score += 1;
  if (hasRoiLanguage) score += 1;
  if (!standingsHeavy || (competitorMentioned && payoutMentioned)) score += 1;
  if (metricMentions <= 1) score += 1;
  if (!driverNames.length || containsOneOf(combined, driverNames)) score += 1;
  if (!payoutLabels.length || containsOneOf(combined, payoutLabels)) score += 1;
  if (!GENERIC_BRIEFING_PATTERNS.some((pattern) => pattern.test(combined))) score += 1;

  return {
    score,
    passed: score >= 6
      && new Set(normalizedLines).size === normalizedLines.length
      && hasRoiLanguage
      && (!standingsHeavy || (competitorMentioned && payoutMentioned)),
  };
}

function composeText({ headline, bestReturnPath, capitalAtRisk, sections }) {
  const lines = [];

  if (headline) lines.push(headline);
  if (bestReturnPath) lines.push(`Best Return Path: ${bestReturnPath}`);
  if (capitalAtRisk) lines.push(`Capital At Risk: ${capitalAtRisk}`);

  if (!lines.length) {
    normalizeSections(sections).forEach((section) => {
      if (section.heading) lines.push(`${section.heading}:`);
      section.bullets.forEach((bullet) => lines.push(`- ${bullet}`));
    });
  }

  return lines.filter(Boolean).join('\n');
}

function normalizeBriefingPayload(payload, {
  phase,
  title,
  summaryData,
  primaryEvent,
  weekendContext,
} = {}) {
  const normalizedPhase = normalizePhaseKey(payload?.phase || phase || 'between_races') || 'between_races';
  const normalizedSections = normalizeSections(payload?.sections);
  const legacyFields = deriveLegacyExecutiveFields(normalizedSections);
  const headline = stripExecutiveLead(payload?.headline || payload?.summary, ['headline', 'summary'])
    || defaultHeadlineForPhase(normalizedPhase);
  const bestReturnPath = stripExecutiveLead(
    payload?.bestReturnPath || payload?.best_return_path || payload?.bestSwing || payload?.best_swing || payload?.financialSnapshot || payload?.financial_snapshot,
    ['best return path', 'best swing', 'financial snapshot'],
  )
    || legacyFields.bestReturnPath
    || defaultBestReturnPath(normalizedPhase);
  const capitalAtRisk = stripExecutiveLead(
    payload?.capitalAtRisk || payload?.capital_at_risk || payload?.mainRisk || payload?.main_risk || payload?.whatMattersNow || payload?.what_matters_now,
    ['capital at risk', 'main risk', 'what matters now'],
  )
    || legacyFields.capitalAtRisk
    || defaultCapitalAtRisk(normalizedPhase);
  const deterministicTitle = String(title || buildDeterministicTitle({ primaryEvent, weekendContext })).trim()
    || 'Dashboard Briefing';

  return {
    phase: normalizedPhase,
    title: deterministicTitle,
    headline,
    summary: headline,
    bestReturnPath,
    capitalAtRisk,
    financialSnapshot: bestReturnPath,
    whatMattersNow: capitalAtRisk,
    sections: normalizedSections,
    text: composeText({
      headline,
      bestReturnPath,
      capitalAtRisk,
      sections: normalizedSections,
    }),
  };
}

function fallbackBriefingFromText(rawText, options) {
  const cleaned = String(rawText || '').trim();
  const lines = cleaned.split('\n').map((line) => line.trim()).filter(Boolean);

  return normalizeBriefingPayload({
    headline: lines[0] || 'Executive summary unavailable.',
    bestReturnPath: lines[1] || '',
    capitalAtRisk: lines[2] || '',
  }, options);
}

function phaseTone(phase) {
  switch (normalizePhaseKey(phase)) {
    case 'before_practice':
      return 'Sound executive and anticipatory. Focus on which owned drivers can justify their purchase prices once the weekend starts.';
    case 'during_practice':
      return 'Sound concise and evaluative. Focus on early pace signals, owned-driver value, and whether the spend looks justified.';
    case 'before_qualifying':
      return 'Sound tactical. Focus on what qualifying will lock in for return upside and cost-basis risk.';
    case 'during_qualifying':
    case 'during_sprint_qualifying':
      return 'Sound urgent and compact. Focus on immediate grid swings and how they affect portfolio value.';
    case 'after_qualifying_before_race':
      return 'Sound pointed and tactical. Focus on confirmed grid position, return upside, and downside against the purchase price.';
    case 'during_race':
    case 'during_sprint':
      return 'Sound urgent and tactical. Focus on live payout windows, owned-driver return upside, and the spend most at risk.';
    case 'immediate_post_race':
      return 'Sound reflective and outcome-focused. Explain which buys paid back, which missed, and what that means for future return.';
    case 'between_races':
      return 'Sound strategic and compact. Focus on portfolio efficiency, concentrated spend, and what matters before the next weekend.';
    default:
      return 'Sound concise, businesslike, and personalized to the participant.';
  }
}

async function generateDashboardBriefing({
  viewer,
  summary,
  primaryEvent,
  liveSession,
  standings,
  portfolio,
  payoutBoard,
  weekendContext,
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

  const phase = determineBriefingPhase({ primaryEvent, liveSession, weekendContext });
  const title = buildDeterministicTitle({
    primaryEvent,
    weekendContext,
  });
  const prompt = `You are writing a compact executive summary for one participant in a private F1 Calcutta pool.
Return JSON only. No markdown fences.

The JSON schema:
{
  "headline": "one short sentence",
  "bestReturnPath": "one short sentence",
  "capitalAtRisk": "one short sentence"
}

Requirements:
- Keep the output tight and businesslike.
- Write exactly one sentence for each field.
- Personalize it to the viewer.
- headline must summarize the participant's return posture for this session or weekend without restating dashboard totals like earned, spent, or net.
- bestReturnPath must name at least one owned driver, optionally a second owned driver, and at least one payout category or live signal explaining how the buy can outperform its price.
- capitalAtRisk must name the owned driver or spend cluster most at risk of underperforming its cost basis and explain the failure mode.
- Do not reference standings or other participants unless another participant directly blocks a payout category this portfolio needs.
- Prefer cost-basis language such as "justify the spend", "outperform the buy price", "pay back", "lagging its cost", and "value path".
- Do not start any field with its own label. Never write "Best return path:", "Capital at risk:", or similar prefixes.
- The three lines must not repeat the same opening clause or restate the same point.
- Prefer exact names, exact payout labels, exact value language, and direct cause-effect phrasing.
- Do not use generic phrases like "monitor closely", "secondary payouts", "value picks", or "opportunities".
- Do not use section headings, bullet lists, or markdown.
- ${phaseTone(phase)}

Run context:
- Generated at: ${new Date().toISOString()}
- Derived phase key: ${phase}
- Visible phase label: ${phaseLabel(phase)}
- Deterministic title: ${title}

Viewer:
- Name: ${viewer?.name || 'Participant'}
- Drivers owned: ${summary?.driversOwned ?? 0}

Weekend context:
${describeWeekendContext(weekendContext)}

Primary event:
- Name: ${primaryEvent?.name || 'No event selected'}
- Type: ${primaryEvent?.type || 'unknown'}
- Dashboard status: ${primaryEvent?.dashboardStatus || 'unknown'}
- Event start: ${primaryEvent?.starts_at || 'TBD'}

Live session:
- Is live: ${liveSession?.isLive ? 'yes' : 'no'}
- Track status: ${liveSession?.trackStatus?.label || liveSession?.statusText || 'N/A'}
- Headline: ${liveSession?.headline || 'N/A'}

Competitive context (use only if it directly blocks a payout path):
${describeStandingsWindow({ standings, viewerId: viewer?.id })}

Owned drivers:
${describeOwnedDrivers(portfolio)}

Current payout board:
${describePayoutBoard(payoutBoard)}
`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 280,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = String(message.content?.[0]?.text || '').trim();
    let normalized = null;

    try {
      const jsonText = extractJsonBlock(rawText);
      const parsed = jsonText ? JSON.parse(jsonText) : null;
      normalized = normalizeBriefingPayload(parsed, {
        phase,
        title,
        summaryData: summary,
        primaryEvent,
        weekendContext,
      });
    } catch {
      normalized = fallbackBriefingFromText(rawText, {
        phase,
        title,
        summaryData: summary,
        primaryEvent,
        weekendContext,
      });
    }

    const quality = scoreExecutiveBriefing(normalized, {
      viewer,
      standings,
      portfolio,
      payoutBoard,
    });
    if (!quality.passed) {
      normalized = buildDeterministicExecutiveBriefing({
        viewer,
        summary,
        standings,
        portfolio,
        payoutBoard,
        primaryEvent,
        weekendContext,
        phase,
      });
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
  phaseLabel,
  scoreExecutiveBriefing,
  buildDeterministicExecutiveBriefing,
};
