import React, { useState } from 'react';

/**
 * Displays a team's ESPN logo, falling back to a refined badge with the seed
 * number if the logo is unavailable or hasn't loaded yet.
 *
 * Props:
 *   espnId     - ESPN numeric team ID (used to build the CDN URL)
 *   teamColor  - Hex color used for the fallback badge background
 *   name       - Team name (used for alt text and first-letter fallback)
 *   seed       - Seed number shown in the fallback badge
 *   size       - Width/height in px (default 32)
 *   eliminated - If true, applies grayscale + opacity and adds "eliminated" to
 *                the aria-label
 *   className  - Extra Tailwind classes for the outer element
 */
export default function TeamLogo({
  espnId,
  teamColor,
  name,
  seed,
  size = 32,
  eliminated = false,
  className = '',
}) {
  const [imgError, setImgError] = useState(false);

  const logoUrl =
    espnId && !imgError
      ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${espnId}.png`
      : null;

  const displayText = seed != null ? `#${seed}` : (name?.[0]?.toUpperCase() ?? '?');
  const fontSize = size <= 20 ? '0.6rem' : size <= 28 ? '0.7rem' : '0.75rem';
  const ariaLabel = eliminated ? `${name ?? 'Team'} — eliminated` : (name ?? '');

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={ariaLabel}
        onError={() => setImgError(true)}
        className={`shrink-0 rounded-sm object-contain ${eliminated ? 'grayscale opacity-40' : ''} ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  // Refined fallback badge
  return (
    <span
      aria-label={ariaLabel}
      className={`shrink-0 rounded-xl flex items-center justify-center font-bold text-white border border-surface-border ${
        eliminated ? 'opacity-40 grayscale' : ''
      } ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: eliminated ? '#1e293b' : (teamColor ?? '#334155'),
        fontSize,
      }}
    >
      {displayText}
    </span>
  );
}
