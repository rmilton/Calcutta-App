import React, { useEffect, useMemo, useState } from 'react';
import { resolveTeamMeta } from '../teamMeta';

function initials(label) {
  const cleaned = String(label || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return cleaned || '?';
}

export default function TeamLogo({
  teamName,
  driverCode,
  size = 24,
  className = '',
  critical = false,
}) {
  const meta = useMemo(
    () => resolveTeamMeta({ teamName, driverCode }),
    [teamName, driverCode]
  );
  const logoCandidates = useMemo(() => {
    if (Array.isArray(meta.logoUrls) && meta.logoUrls.length) return meta.logoUrls;
    return meta.logoUrl ? [meta.logoUrl] : [];
  }, [meta.logoUrls, meta.logoUrl]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setCandidateIndex(0);
    setLoadFailed(false);
  }, [meta.teamName, logoCandidates.join('|')]);

  const activeLogoUrl = logoCandidates[candidateIndex];

  if (!activeLogoUrl || loadFailed) {
    return (
      <span
        className={`team-logo-fallback ${className}`.trim()}
        style={{
          width: size,
          height: size,
          background: `linear-gradient(145deg, ${meta.primaryColor}44, ${meta.secondaryColor})`,
          color: meta.textColor,
          borderColor: `${meta.primaryColor}88`,
        }}
        aria-label={`${meta.teamName} badge`}
      >
        {initials(meta.teamName)}
      </span>
    );
  }

  return (
    <img
      className={`team-logo ${className}`.trim()}
      src={activeLogoUrl}
      alt={`${meta.teamName} logo`}
      width={size}
      height={size}
      loading={critical ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => {
        if (candidateIndex < logoCandidates.length - 1) {
          setCandidateIndex((prev) => prev + 1);
          return;
        }
        setLoadFailed(true);
      }}
    />
  );
}
