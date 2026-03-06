export const GUIDE_EVENT_PAYOUTS = {
  grandPrix: {
    title: 'Grand Prix',
    totalBps: 350,
    totalPercent: '3.5%',
    rows: [
      { category: 'Race Winner', bps: 50 },
      { category: '2nd Place', bps: 25 },
      { category: '3rd Place', bps: 25 },
      { category: 'Best P6+', bps: 50 },
      { category: 'Best P11+', bps: 50 },
      { category: 'Most Positions Gained', bps: 50 },
      { category: 'Slowest Pit Stop', bps: 25 },
      { category: 'Random Position Bonus (P4+)', bps: 75 },
    ],
  },
  sprint: {
    title: 'Sprint',
    totalBps: 150,
    totalPercent: '1.5%',
    rows: [
      { category: 'Sprint Winner', bps: 25 },
      { category: 'Best P6+', bps: 25 },
      { category: 'Most Positions Gained', bps: 25 },
      { category: 'Random Position Bonus (P4+)', bps: 75 },
    ],
  },
  seasonBonus: {
    title: 'Season Bonus',
    totalBps: 700,
    totalPercent: '7.0%',
    rows: [
      { category: 'Drivers Champion', bps: 150 },
      { category: 'Most Race Wins', bps: 100 },
      { category: 'Most Top-10 Finishes Outside Top 4', bps: 150 },
      { category: 'Season Random Standing Position', bps: 200 },
      { category: 'Biggest Single-Race Climb', bps: 100 },
    ],
  },
};

export const GUIDE_FAQ = [
  {
    question: 'Do I need to know F1 to play?',
    answer: 'No. The app tracks race outcomes and payouts for you. If you understand bidding and simple risk/reward, you can compete.',
  },
  {
    question: 'Can I win if I do not buy the top drivers?',
    answer: 'Yes. Many categories reward value drivers and race-to-race movement, not only podium finishers.',
  },
  {
    question: 'How much can I spend in the auction?',
    answer: 'The admin sets the auction spend cap for participants. It defaults to $200, and you can spread that budget across drivers however you want up to the configured limit.',
  },
  {
    question: 'What happens on ties?',
    answer: 'When multiple drivers tie for a category, the category payout is split evenly among tied winners. Any extra cents are distributed fairly by the split logic.',
  },
  {
    question: 'When are results and payouts updated?',
    answer: 'The admin syncs or enters results, then scoring runs and payouts appear in Events, Standings, and My Drivers.',
  },
  {
    question: 'Can rules change mid-season?',
    answer: 'Rules are managed by the admin. The live pool follows the current configured settings in the app.',
  },
];

export const GUIDE_SECTION_LINKS = [
  { id: 'what-is-calcutta', label: 'What Is a Calcutta' },
  { id: 'buy-in', label: 'Buy-In' },
  { id: 'auction-format', label: 'Auction Format' },
  { id: 'payout-model', label: 'Payout Model' },
  { id: 'season-bonus', label: 'Season Bonus' },
  { id: 'faq', label: 'FAQ' },
];
