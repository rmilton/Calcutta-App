import React, { useState } from 'react';

/**
 * Displays a team's ESPN logo, falling back to a colored badge with the seed
 * number if the logo is unavailable or hasn't loaded yet.
 *
 * Props:
 *   espnId     - ESPN numeric team ID (used to build the CDN URL)
 *   teamColor  - Hex color used for the fallback badge background
 *   name       - Team name (used for alt text and first-letter fallback)
 *   seed       - Seed number shown in the fallback badge
 *   size       - Width/height in px (default 32)
 *   eliminated - If true, applies grayscale + opacity to the logo image,
 *                or uses a muted grey for the fallback badge
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

  const fallbackColor = eliminated ? '#475569' : (teamColor || '#6366f1');
  const displayText = seed != null ? `#${seed}` : (name?.[0]?.toUpperCase() ?? '?');
  const fontSize = size <= 20 ? '0.6rem' : size <= 28 ? '0.7rem' : '0.75rem';

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name ?? ''}
        onError={() => setImgError(true)}
        className={`shrink-0 rounded-sm object-contain ${eliminated ? 'grayscale opacity-40' : ''} ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={`shrink-0 rounded-full flex items-center justify-center font-bold text-white ${className}`}
      style={{ width: size, height: size, backgroundColor: fallbackColor, fontSize }}
    >
      {displayText}
    </span>
  );
}
