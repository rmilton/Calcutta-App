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

export const toTimestampMs = (iso) => {
  if (!iso) return null;
  const date = new Date(iso);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : null;
};

export const normalizeEventName = (name) => String(name || '')
  .replace(/\s*\(sprint\)\s*/ig, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

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
    slowest_pit_stop: 'Slowest Pit Stop',
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

export const auditRuleSummary = (category, { randomBonusPosition } = {}) => {
  const map = {
    race_winner: 'Pays the driver who finished 1st.',
    sprint_winner: 'Pays the driver who won the sprint.',
    second_place: 'Pays the driver who finished 2nd.',
    third_place: 'Pays the driver who finished 3rd.',
    best_p6_or_lower: 'Pays the best finisher from positions 6 through 20.',
    best_p11_or_lower: 'Pays the best finisher from positions 11 through 20.',
    most_positions_gained: 'Pays the driver with the most positions gained.',
    slowest_pit_stop: 'Pays the driver with the slowest recorded pit stop duration from OpenF1 pit data.',
    second_most_positions_gained: 'Pays the driver with the second-most positions gained.',
    random_finish_bonus: randomBonusPosition
      ? `Pays the driver who finished in random position ${randomBonusPosition}.`
      : 'Pays the driver in the random finishing position draw.',
  };
  return map[category] || 'Rule details unavailable.';
};
