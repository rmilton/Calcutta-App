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
