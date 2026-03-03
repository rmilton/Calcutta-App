/**
 * Format a number as a US dollar amount.
 * Whole numbers show no cents ($25), fractional values show cents ($25.50).
 * Large numbers get comma separators ($1,234).
 */
export const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n ?? 0);

export const api = (path, opts = {}) =>
  fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });

export const REGION_COLORS = {
  East:    '#ef4444',
  West:    '#3b82f6',
  South:   '#22c55e',
  Midwest: '#f59e0b',
};

export const REGIONS = ['East', 'West', 'South', 'Midwest'];

export const ROUND_NAMES = {
  1: 'Round of 64',
  2: 'Round of 32',
  3: 'Sweet 16',
  4: 'Elite 8',
  5: 'Final Four',
  6: 'Championship',
};

export const ROUND_NAMES_SHORT = {
  1: 'R64',
  2: 'R32',
  3: 'S16',
  4: 'E8',
  5: 'F4',
  6: 'Champ',
};

export const ROUND_NAMES_LIST = Object.values(ROUND_NAMES);
