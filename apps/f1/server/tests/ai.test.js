const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeBriefingPayload,
  scoreExecutiveBriefing,
  buildDeterministicExecutiveBriefing,
} = require('../ai');

test('normalizeBriefingPayload accepts return-path aliases and strips old labels', () => {
  const briefing = normalizeBriefingPayload({
    headline: 'Your return this weekend hinges on Verstappen justifying the premium spend.',
    bestReturnPath: 'Best return path: Verstappen landing Sprint Winner plus Best Finisher P6 or Lower is your best value route.',
    capitalAtRisk: 'Capital at risk: Perez is still lagging his cost if he misses the payout windows again.',
  }, {
    phase: 'during_sprint',
    title: 'Chinese GP Sprint - Return Outlook',
    summaryData: { rank: 3, netCents: -1200, driversOwned: 4 },
  });

  assert.equal(briefing.summary, 'Your return this weekend hinges on Verstappen justifying the premium spend.');
  assert.equal(briefing.bestReturnPath, 'Verstappen landing Sprint Winner plus Best Finisher P6 or Lower is your best value route.');
  assert.equal(briefing.capitalAtRisk, 'Perez is still lagging his cost if he misses the payout windows again.');
});

test('scoreExecutiveBriefing rejects repetitive generic summaries and deterministic fallback is richer', () => {
  const weakBriefing = normalizeBriefingPayload({
    headline: 'You are $33 behind P3 with five drivers in play.',
    bestReturnPath: 'You are $33 behind P3 with five drivers in play.',
    capitalAtRisk: 'Monitor closely for opportunities.',
  }, {
    phase: 'before_practice',
    title: 'Chinese GP Sprint',
    summaryData: { rank: 4, netCents: -3300, driversOwned: 5 },
  });

  const context = {
    viewer: { id: 4, name: 'Sam' },
    summary: { rank: 4, netCents: -3300, driversOwned: 5 },
    standings: [
      { id: 1, name: 'Alex', total_earned_cents: 15000, total_spent_cents: 5000, drivers_owned: 5 },
      { id: 2, name: 'Paul', total_earned_cents: 14000, total_spent_cents: 5000, drivers_owned: 4 },
      { id: 4, name: 'Sam', total_earned_cents: 12600, total_spent_cents: 5000, drivers_owned: 5 },
      { id: 5, name: 'Joe', total_earned_cents: 12000, total_spent_cents: 5000, drivers_owned: 4 },
    ],
    portfolio: {
      drivers: [
        { driver_name: 'Max Verstappen', total_earnings_cents: 4000, purchase_price_cents: 3000 },
        { driver_name: 'Pierre Gasly', total_earnings_cents: 2000, purchase_price_cents: 1500 },
        { driver_name: 'Sergio Perez', total_earnings_cents: 1500, purchase_price_cents: 1200 },
      ],
    },
    payoutBoard: {
      rules: [
        { label: 'Sprint Winner', holders: [{ isViewerOwner: true, participantName: 'Sam' }] },
        { label: 'Best Finisher P6 or Lower', holders: [] },
        { label: 'Most Positions Gained', holders: [{ isViewerOwner: false, participantName: 'Paul' }] },
      ],
    },
    primaryEvent: { name: 'Chinese GP Sprint' },
    weekendContext: { title: 'Chinese GP Sprint' },
    phase: 'during_sprint',
  };

  const quality = scoreExecutiveBriefing(weakBriefing, context);
  assert.equal(quality.passed, false);

  const fallback = buildDeterministicExecutiveBriefing(context);
  assert.match(fallback.summary, /return|value|spend/i);
  assert.match(fallback.summary, /Max Verstappen|Pierre Gasly|Sergio Perez/);
  assert.match(fallback.bestReturnPath, /Sprint Winner|Best Finisher P6 or Lower|Most Positions Gained/);
  assert.match(fallback.capitalAtRisk, /spend|cost|ticket|price|lagging/i);
  assert.doesNotMatch(fallback.bestReturnPath, /^Best return path[:\-]/i);
  assert.doesNotMatch(fallback.capitalAtRisk, /^Capital at risk[:\-]/i);
});
