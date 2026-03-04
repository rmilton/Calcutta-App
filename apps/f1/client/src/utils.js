export const api = (path, opts = {}) => fetch(`/api${path}`, {
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  ...opts,
});

export const fmtCents = (cents) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
}).format((Number(cents) || 0) / 100);

export const fmtWhen = (iso) => {
  if (!iso) return 'TBD';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'TBD';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
};

export const eventTypeLabel = (type) => (type === 'sprint' ? 'Sprint' : 'Grand Prix');

export const categoryLabel = (category) => {
  const map = {
    race_winner: 'Race Winner',
    sprint_winner: 'Sprint Winner',
    second_place: '2nd Place',
    third_place: '3rd Place',
    best_p6_or_lower: 'Best P6+',
    best_p11_or_lower: 'Best P11+',
    most_positions_gained: 'Most Positions Gained',
    second_most_positions_gained: '2nd Most Positions Gained',
    random_finish_bonus: 'Random Position Bonus',
    drivers_champion: 'Drivers Champion',
    most_race_wins: 'Most Race Wins',
    most_top10_outside_top4: 'Most Top-10 Finishes Outside Top 4',
    season_random_finish_position: 'Season Random Standing Position',
    biggest_single_race_climb: 'Biggest Single-Race Climb',
    most_podiums: 'Most Podiums',
    best_avg_finish: 'Best Avg Finish',
  };
  return map[category] || category;
};
