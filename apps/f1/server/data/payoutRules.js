const EVENT_RULES = {
  grand_prix: [
    { category: 'race_winner', label: 'Race Winner', bps: 40, rank_order: 1 },
    { category: 'second_place', label: '2nd Place Finish', bps: 25, rank_order: 1 },
    { category: 'third_place', label: '3rd Place Finish', bps: 20, rank_order: 1 },
    { category: 'best_p6_or_lower', label: 'Best Finisher P6 or Lower', bps: 45, rank_order: 1 },
    { category: 'best_p11_or_lower', label: 'Best Finisher P11 or Lower', bps: 35, rank_order: 1 },
    { category: 'most_positions_gained', label: 'Most Positions Gained', bps: 50, rank_order: 1 },
    { category: 'second_most_positions_gained', label: '2nd Most Positions Gained', bps: 30, rank_order: 2 },
    { category: 'random_finish_bonus', label: 'Random Finishing Position Bonus', bps: 55, rank_order: 1 },
  ],
  sprint: [
    { category: 'sprint_winner', label: 'Sprint Winner', bps: 25, rank_order: 1 },
    { category: 'best_p6_or_lower', label: 'Best Finisher P6 or Lower', bps: 35, rank_order: 1 },
    { category: 'most_positions_gained', label: 'Most Positions Gained', bps: 25, rank_order: 1 },
    { category: 'random_finish_bonus', label: 'Random Finishing Position Bonus', bps: 15, rank_order: 1 },
  ],
};

const DEFAULT_SEASON_BONUS_RULES = [
  { category: 'drivers_champion', label: 'Drivers\' Champion', bps: 4000, rank_order: 1 },
  { category: 'most_race_wins', label: 'Most Race Wins', bps: 2500, rank_order: 2 },
  { category: 'most_podiums', label: 'Most Podiums', bps: 2000, rank_order: 3 },
  { category: 'best_avg_finish', label: 'Best Average Finish', bps: 1500, rank_order: 4 },
];

module.exports = {
  EVENT_RULES,
  DEFAULT_SEASON_BONUS_RULES,
};
