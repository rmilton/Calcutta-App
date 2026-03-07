import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DriverIdentity from '../components/DriverIdentity';
import { useSocketEvent } from '../context/SocketContext';
import {
  api,
  eventTypeLabel,
  fmtCents,
  fmtWhen,
  readJsonSafely,
  toTimestampMs,
} from '../utils';

function formatSignedNumber(value) {
  if (value == null || !Number.isFinite(Number(value))) return '0';
  const num = Number(value);
  return `${num > 0 ? '+' : ''}${num}`;
}

function formatCountdown(iso) {
  const targetMs = toTimestampMs(iso);
  if (targetMs == null) return 'TBD';
  const deltaMs = targetMs - Date.now();
  if (deltaMs <= 0) return 'Started';

  const totalMinutes = Math.floor(deltaMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function rowNet(row) {
  return Number(row?.total_earned_cents || 0) - Number(row?.total_spent_cents || 0);
}

function refreshIntervalMs(data) {
  return data?.liveSession?.isLive ? 15_000 : 60_000;
}

function LiveStatusPill({ liveSession, primaryEvent }) {
  const liveClassName = liveSession?.isLive ? 'dashboard-status-pill live' : 'dashboard-status-pill';
  const label = liveSession?.isLive
    ? (liveSession?.statusText || 'Live')
    : (primaryEvent?.dashboardStatus || 'Waiting');

  return <span className={liveClassName}>{label}</span>;
}

function DriverTrackerTable({ rows, emptyText }) {
  if (!rows?.length) {
    return <p className="muted">{emptyText}</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Driver</th>
            <th>Pos</th>
            <th>Delta</th>
            <th>Gap</th>
            <th>Pit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((driver) => (
            <tr key={`${driver.external_driver_id || driver.driver_id}`}>
              <td>
                <DriverIdentity
                  driverName={driver.driver_name}
                  driverCode={driver.driver_code}
                  teamName={driver.team_name}
                  compact
                  showCode={false}
                />
              </td>
              <td>{driver.position ? `P${driver.position}` : '-'}</td>
              <td className={(driver.positionsGained || 0) >= 0 ? 'text-pos' : 'text-neg'}>
                {driver.positionsGained == null ? '-' : formatSignedNumber(driver.positionsGained)}
              </td>
              <td>{driver.gapToLeader || driver.intervalToAhead || '-'}</td>
              <td>{driver.lastPitStopSeconds ? `${Number(driver.lastPitStopSeconds).toFixed(2)}s` : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompactRankingList({ rows, emptyText, valueLabel }) {
  if (!rows?.length) return <p className="muted">{emptyText}</p>;

  return (
    <ul className="list dashboard-ranking-list">
      {rows.map((row) => (
        <li key={`${row.external_driver_id || row.driver_code || row.driver_name}`}>
          <div className="dashboard-ranking-main">
            <strong>{row.driver_name || row.driver_code || 'Driver'}</strong>
            <span className="muted small">{row.team_name || 'Team N/A'}</span>
          </div>
          <div className="dashboard-ranking-value">
            <strong>{valueLabel(row)}</strong>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [briefing, setBriefing] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState('');

  const refresh = useCallback(async () => {
    const response = await api('/standings/dashboard');
    const payload = await readJsonSafely(response);
    if (!response.ok) {
      throw new Error(payload?.error || 'Dashboard failed to load.');
    }

    setData(payload);
    setError('');
    setBriefing(payload?.briefing || null);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    refresh()
      .catch((loadError) => {
        if (!active) return;
        setError(loadError.message || 'Dashboard failed to load.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (!data) return undefined;
    const intervalId = window.setInterval(() => {
      refresh().catch((loadError) => setError(loadError.message || 'Dashboard failed to refresh.'));
    }, refreshIntervalMs(data));

    return () => window.clearInterval(intervalId);
  }, [data, refresh]);

  useSocketEvent('standings:update', useCallback(() => {
    refresh().catch((loadError) => setError(loadError.message || 'Dashboard failed to refresh.'));
  }, [refresh]));

  const requestBriefing = useCallback(async ({ force = false } = {}) => {
    setBriefingLoading(true);
    setBriefingError('');

    try {
      const response = await api('/standings/dashboard/briefing', {
        method: 'POST',
        body: JSON.stringify({ force }),
      });
      const payload = await readJsonSafely(response);
      if (!response.ok) {
        throw new Error(payload?.error || 'Dashboard briefing failed to load.');
      }

      setBriefing(payload?.briefing || null);
      if (payload?.briefing?.error) setBriefingError(payload.briefing.error);
    } catch (loadError) {
      setBriefingError(loadError.message || 'Dashboard briefing failed to load.');
    } finally {
      setBriefingLoading(false);
    }
  }, []);

  const standings = data?.standings || [];
  const summary = data?.summary || {};
  const primaryEvent = data?.primaryEvent || null;
  const liveSession = data?.liveSession || null;
  const isAdmin = !!data?.viewer?.isAdmin;

  const highlightedStandings = useMemo(() => standings.map((row, index) => ({
    ...row,
    rank: index + 1,
    net_cents: rowNet(row),
    isViewer: Number(row.id) === Number(data?.viewer?.id),
  })), [standings, data?.viewer?.id]);

  const raceLeaders = liveSession?.leaders || [];
  const ownedDrivers = liveSession?.ownedDrivers || [];
  const championshipDrivers = liveSession?.championshipDrivers || [];

  if (loading && !data) {
    return <section className="loading-panel">Loading dashboard...</section>;
  }

  if (!data) {
    return (
      <section className="panel stack">
        <h2>Dashboard</h2>
        <p className="error-text">{error || 'Dashboard data is unavailable.'}</p>
      </section>
    );
  }

  return (
    <div className="stack-lg dashboard-page">
      <section className="panel telemetry-strip stagger-in">
        {isAdmin ? (
          <>
            <div className="strip-item">
              <span className="label">Total Pot</span>
              <strong>{fmtCents(summary.totalPotCents)}</strong>
            </div>
            <div className="strip-item">
              <span className="label">Participants</span>
              <strong>{summary.participantCount || 0}</strong>
            </div>
            <div className="strip-item">
              <span className="label">Primary Event</span>
              <strong>{summary.primaryEventLabel || primaryEvent?.name || 'None'}</strong>
            </div>
            <div className="strip-item">
              <span className="label">Live Freshness</span>
              <strong>{summary.liveDataFreshnessSeconds == null ? 'N/A' : `${summary.liveDataFreshnessSeconds}s`}</strong>
            </div>
          </>
        ) : (
          <>
            <div className="strip-item">
              <span className="label">Rank</span>
              <strong>{summary.rank ? `#${summary.rank}` : 'N/A'}</strong>
            </div>
            <div className="strip-item">
              <span className="label">Earned</span>
              <strong>{fmtCents(summary.totalEarnedCents)}</strong>
            </div>
            <div className="strip-item">
              <span className="label">Spent</span>
              <strong>{fmtCents(summary.totalSpentCents)}</strong>
            </div>
            <div className="strip-item">
              <span className="label">Net</span>
              <strong className={Number(summary.netCents || 0) >= 0 ? 'text-pos' : 'text-neg'}>
                {fmtCents(summary.netCents)}
              </strong>
            </div>
          </>
        )}
      </section>

      <div className="dashboard-hero-grid">
        <section className="panel live-panel stack dashboard-event-card">
          <div className="dashboard-card-head">
            <div>
              <div className="live-header">
                <span className={`status-led ${liveSession?.isLive ? 'dashboard-led-live' : ''}`} />
                <span>{liveSession?.isLive ? 'Live Race Center' : 'Race Center'}</span>
              </div>
              <h2>{primaryEvent?.name || 'No scoring event scheduled'}</h2>
              <p className="muted">
                {primaryEvent ? `${eventTypeLabel(primaryEvent.type)} • ${fmtWhen(primaryEvent.starts_at)}` : 'No scoring session available.'}
              </p>
            </div>
            <LiveStatusPill liveSession={liveSession} primaryEvent={primaryEvent} />
          </div>

          <div className="dashboard-event-kpis">
            <div className="events-pot-kpi">
              <span className="label">Event State</span>
              <strong>{primaryEvent?.dashboardStatus || 'N/A'}</strong>
            </div>
            <div className="events-pot-kpi">
              <span className="label">{liveSession?.isLive ? 'Track Status' : 'Countdown'}</span>
              <strong>{liveSession?.isLive ? (liveSession?.trackStatus?.label || liveSession?.statusText || 'Live') : formatCountdown(primaryEvent?.starts_at)}</strong>
            </div>
            <div className="events-pot-kpi">
              <span className="label">Last Update</span>
              <strong>{fmtWhen(liveSession?.fetchedAt)}</strong>
            </div>
          </div>

          <p className="dashboard-callout">
            {liveSession?.headline || liveSession?.statusText || 'The next scoring session will appear here.'}
          </p>

          {liveSession?.degradedReason ? (
            <p className="muted small">{liveSession.degradedReason}</p>
          ) : null}
        </section>

        <section className="panel stack dashboard-briefing-card">
          <div className="dashboard-card-head">
            <div>
              <div className="live-header">
                <span className="status-led" />
                <span>AI Briefing</span>
              </div>
              <h2>Personal Readout</h2>
              <p className="muted">
                Anthropic-powered summary of your position, live race context, and likely impact.
              </p>
            </div>
            <button
              className="btn btn-outline"
              disabled={briefingLoading || !data?.briefingMeta?.available}
              onClick={() => requestBriefing({ force: !!briefing?.generatedAt })}
            >
              {briefingLoading ? 'Loading...' : (briefing?.generatedAt ? 'Refresh Briefing' : 'Generate Briefing')}
            </button>
          </div>

          {!data?.briefingMeta?.available ? (
            <p className="muted">Anthropic is not configured for the F1 service yet.</p>
          ) : null}

          {briefing?.text ? (
            <>
              <p className="dashboard-briefing-text">{briefing.text}</p>
              <p className="muted small">
                {briefing.cached ? 'Cached' : 'Fresh'} briefing{briefing.generatedAt ? ` • ${fmtWhen(briefing.generatedAt)}` : ''}.
              </p>
            </>
          ) : (
            <p className="muted">Generate a briefing when you want a concise race-and-standings summary.</p>
          )}

          {briefingError ? <p className="error-text">{briefingError}</p> : null}
        </section>
      </div>

      <div className="dashboard-main-grid">
        <section className="panel stack">
          <div className="dashboard-card-head">
            <div>
              <h2>{isAdmin ? 'Race Leaders' : 'My Drivers Live'}</h2>
              <p className="muted">
                {isAdmin
                  ? 'Top runners in the current scoring session.'
                  : 'Your purchased drivers with live position, gains, and pit context.'}
              </p>
            </div>
            {!isAdmin ? (
              <Link className="btn btn-outline" to="/my-drivers">Open My Drivers</Link>
            ) : null}
          </div>

          <DriverTrackerTable
            rows={isAdmin ? raceLeaders : ownedDrivers}
            emptyText={isAdmin ? 'No live leaders available right now.' : 'No owned drivers are currently showing live race data.'}
          />
        </section>

        <section className="panel stack">
          <div className="dashboard-card-head">
            <div>
              <h2>{isAdmin ? 'Championship Snapshot' : 'Race Context'}</h2>
              <p className="muted">
                {isAdmin
                  ? 'Driver standings from the live session payload.'
                  : 'Session leaders and championship context for the current weekend.'}
              </p>
            </div>
          </div>

          {!isAdmin ? (
            <>
              <CompactRankingList
                rows={raceLeaders}
                emptyText="Leader board will populate when live data is available."
                valueLabel={(row) => (row.position ? `P${row.position}` : '-')}
              />
              <CompactRankingList
                rows={championshipDrivers}
                emptyText="Championship positions are unavailable right now."
                valueLabel={(row) => (
                  row.championshipPosition
                    ? `P${row.championshipPosition} • ${row.championshipPoints ?? 0} pts`
                    : '-'
                )}
              />
            </>
          ) : (
            <CompactRankingList
              rows={championshipDrivers}
              emptyText="Championship data is unavailable right now."
              valueLabel={(row) => (
                row.championshipPosition
                  ? `P${row.championshipPosition} • ${row.championshipPoints ?? 0} pts`
                  : '-'
              )}
            />
          )}
        </section>
      </div>

      <section className="panel">
        <div className="dashboard-card-head">
          <div>
            <h2>Overall Standings</h2>
            <p className="muted">Full league table with spend, earnings, and current net position.</p>
          </div>
        </div>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Participant</th>
                <th>Drivers</th>
                <th>Spent</th>
                <th>Earned</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {highlightedStandings.map((row) => (
                <tr key={row.id} className={row.isViewer ? 'dashboard-table-row-active' : ''}>
                  <td>{row.rank}</td>
                  <td>
                    <div className="dashboard-participant-cell">
                      <span
                        className="avatar dashboard-participant-avatar"
                        style={{
                          backgroundColor: `${row.color || '#e10600'}22`,
                          color: row.color || '#e10600',
                          borderColor: `${row.color || '#e10600'}66`,
                        }}
                      >
                        {(row.name || '?').trim().charAt(0).toUpperCase() || '?'}
                      </span>
                      <span>{row.name}</span>
                    </div>
                  </td>
                  <td>{row.drivers_owned}</td>
                  <td>{fmtCents(row.total_spent_cents)}</td>
                  <td>{fmtCents(row.total_earned_cents)}</td>
                  <td className={row.net_cents >= 0 ? 'text-pos' : 'text-neg'}>{fmtCents(row.net_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
