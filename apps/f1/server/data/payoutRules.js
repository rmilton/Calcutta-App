const PAYOUT_MODEL_V2 = 2;

const EVENT_RULES = {
  grand_prix: [
    { category: 'race_winner', label: 'Race Winner', bps: 50, rank_order: 1 },
    { category: 'second_place', label: '2nd Place Finish', bps: 25, rank_order: 1 },
    { category: 'third_place', label: '3rd Place Finish', bps: 25, rank_order: 1 },
    { category: 'best_p6_or_lower', label: 'Best Finisher P6 or Lower', bps: 50, rank_order: 1 },
    { category: 'best_p11_or_lower', label: 'Best Finisher P11 or Lower', bps: 50, rank_order: 1 },
    { category: 'most_positions_gained', label: 'Most Positions Gained', bps: 50, rank_order: 1 },
    { category: 'second_most_positions_gained', label: '2nd Most Positions Gained', bps: 25, rank_order: 2 },
    { category: 'random_finish_bonus', label: 'Random Finishing Position Bonus (P4+)', bps: 75, rank_order: 1 },
  ],
  sprint: [
    { category: 'sprint_winner', label: 'Sprint Winner', bps: 25, rank_order: 1 },
    { category: 'best_p6_or_lower', label: 'Best Finisher P6 or Lower', bps: 25, rank_order: 1 },
    { category: 'most_positions_gained', label: 'Most Positions Gained', bps: 25, rank_order: 1 },
    { category: 'random_finish_bonus', label: 'Random Finishing Position Bonus (P4+)', bps: 75, rank_order: 1 },
  ],
};

const DEFAULT_SEASON_BONUS_RULES = [
  { category: 'drivers_champion', label: 'Drivers Champion', bps: 150, rank_order: 1 },
  { category: 'most_race_wins', label: 'Most Race Wins', bps: 100, rank_order: 2 },
  { category: 'most_top10_outside_top4', label: 'Most Top-10 Finishes Outside Top 4', bps: 150, rank_order: 3 },
  { category: 'season_random_finish_position', label: 'Random Finishing Position Bonus', bps: 200, rank_order: 4 },
  { category: 'biggest_single_race_climb', label: 'Biggest Single-Race Climb', bps: 100, rank_order: 5 },
];

const DEPRECATED_SEASON_BONUS_CATEGORIES = [
  'most_podiums',
  'best_avg_finish',
];

module.exports = {
  EVENT_RULES,
  DEFAULT_SEASON_BONUS_RULES,
  DEPRECATED_SEASON_BONUS_CATEGORIES,
  PAYOUT_MODEL_V2,
};
