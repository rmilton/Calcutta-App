import React, { useMemo } from 'react';
import TeamLogo from './TeamLogo';
import { getTeamColorStyle, resolveTeamMeta } from '../teamMeta';

export default function DriverIdentity({
  driverName,
  driverCode,
  teamName,
  compact = false,
  className = '',
  showCode = true,
  showTeam = true,
  logoSize,
}) {
  const meta = useMemo(
    () => resolveTeamMeta({ teamName, driverCode }),
    [teamName, driverCode]
  );
  const colorStyle = getTeamColorStyle({ teamName, driverCode });

  const parts = [
    showCode ? driverCode : null,
    showTeam ? (teamName || meta.teamName) : null,
  ].filter(Boolean);

  return (
    <div className={`driver-identity ${compact ? 'driver-identity-compact' : ''} ${className}`.trim()}>
      <TeamLogo
        teamName={teamName}
        driverCode={driverCode}
        size={logoSize || (compact ? 20 : 26)}
      />
      <div className="driver-identity-copy">
        <div className="driver-identity-name team-accent-text" style={colorStyle}>
          {driverName}
        </div>
        {parts.length ? (
          <div className="driver-identity-meta team-accent-text" style={colorStyle}>
            {parts.join(' - ')}
          </div>
        ) : null}
      </div>
    </div>
  );
}
