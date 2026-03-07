import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DriverIdentity from '../components/DriverIdentity';
import { useSocketEvent } from '../context/SocketContext';
import useMediaQuery from '../useMediaQuery';
import {
  api,
  eventTypeLabel,
  fmtCents,
  fmtWhen,
  readJsonSafely,
  toTimestampMs,
} from '../utils';

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

function formatBpsPercent(bps) {
  const num = Number(bps);
  if (!Number.isFinite(num)) return '-';
  return `${(num / 100).toFixed(2)}%`;
}

function payoutStatusLabel(rule) {
  if (rule?.status === 'draw_pending') return 'Draw Pending';
  if (rule?.status === 'pending') return 'TBD';
  if (rule?.status === 'unavailable') return 'Live Unavailable';
  return 'Live';
}

function HolderKey(prefix, holder) {
  return `${prefix}-${holder.driverId || holder.driverCode || holder.driverName}`;
}

function PayoutBoardTable({ rules }) {
  if (!rules?.length) {
    return <p className="muted">No payout categories are configured for this event.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Pool</th>
            <th>Current Holder</th>
            <th>Owner</th>
            <th>Metric</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.category}>
              <td>
                <div className="dashboard-payout-cell">
                  <strong>{rule.label}</strong>
                  <span className={`dashboard-payout-status ${rule.status}`}>{payoutStatusLabel(rule)}</span>
                  {rule.note ? <span className="muted small">{rule.note}</span> : null}
                </div>
              </td>
              <td>{formatBpsPercent(rule.bps)}</td>
              <td>
                {rule.holders?.length ? (
                  <div className="dashboard-payout-stack">
                    {rule.holders.map((holder) => (
                      <div
                        key={HolderKey(rule.category, holder)}
                        className="dashboard-payout-holder"
                      >
                        <DriverIdentity
                          driverName={holder.driverName}
                          driverCode={holder.driverCode}
                          teamName={holder.teamName}
                          compact
                          showCode={false}
                        />
                        {holder.isViewerOwner ? <span className="dashboard-owner-badge">Yours</span> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="muted">{payoutStatusLabel(rule)}</span>
                )}
              </td>
              <td>
                {rule.holders?.length ? (
                  <div className="dashboard-payout-stack">
                    {rule.holders.map((holder) => (
                      <div key={HolderKey(`${rule.category}-owner`, holder)} className="dashboard-owner-line">
                        {holder.participantName ? (
                          <>
                            <span
                              className="avatar dashboard-participant-avatar"
                              style={{
                                backgroundColor: `${holder.participantColor || '#e10600'}22`,
                                color: holder.participantColor || '#e10600',
                                borderColor: `${holder.participantColor || '#e10600'}66`,
                              }}
                            >
                              {(holder.participantName || '?').trim().charAt(0).toUpperCase() || '?'}
                            </span>
                            <span>{holder.participantName}</span>
                          </>
                        ) : (
                          <span className="muted">Unowned</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="muted">-</span>
                )}
              </td>
              <td>
                {rule.holders?.length ? (
                  <div className="dashboard-payout-stack">
                    {rule.holders.map((holder) => (
                      <div key={HolderKey(`${rule.category}-metric`, holder)}>
                        {holder.displayValue || rule.metric?.display || '-'}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="muted">{rule.metric?.display || '-'}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PayoutBoardCards({ rules }) {
  if (!rules?.length) {
    return <p className="muted">No payout categories are configured for this event.</p>;
  }

  return (
    <div className="mobile-card-list">
      {rules.map((rule) => (
        <article key={rule.category} className="mobile-info-card">
          <div className="mobile-info-card-head">
            <div>
              <strong>{rule.label}</strong>
              <div className="muted small">Pool {formatBpsPercent(rule.bps)}</div>
            </div>
            <span className={`dashboard-payout-status ${rule.status}`}>{payoutStatusLabel(rule)}</span>
          </div>

          {rule.note ? <p className="muted small mobile-card-note">{rule.note}</p> : null}

          {rule.holders?.length ? (
            <div className="mobile-card-stack">
              {rule.holders.map((holder) => (
                <div key={HolderKey(rule.category, holder)} className="mobile-holder-card">
                  <DriverIdentity
                    driverName={holder.driverName}
                    driverCode={holder.driverCode}
                    teamName={holder.teamName}
                    compact
                    showCode={false}
                  />
                  <div className="mobile-holder-meta">
                    <div className="dashboard-owner-line">
                      {holder.participantName ? (
                        <>
                          <span
                            className="avatar dashboard-participant-avatar"
                            style={{
                              backgroundColor: `${holder.participantColor || '#e10600'}22`,
                              color: holder.participantColor || '#e10600',
                              borderColor: `${holder.participantColor || '#e10600'}66`,
                            }}
                          >
                            {(holder.participantName || '?').trim().charAt(0).toUpperCase() || '?'}
                          </span>
                          <span>{holder.participantName}</span>
                        </>
                      ) : (
                        <span className="muted">Unowned</span>
                      )}
                      {holder.isViewerOwner ? <span className="dashboard-owner-badge">Yours</span> : null}
                    </div>
                    <div className="mobile-stat-grid">
                      <div>
                        <span className="label">Metric</span>
                        <strong>{holder.displayValue || rule.metric?.display || '-'}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mobile-stat-grid">
              <div>
                <span className="label">Current Holder</span>
                <strong>{payoutStatusLabel(rule)}</strong>
              </div>
              <div>
                <span className="label">Metric</span>
                <strong>{rule.metric?.display || '-'}</strong>
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function StandingsCards({ rows }) {
  return (
    <div className="mobile-card-list">
      {rows.map((row) => (
        <article key={row.id} className={`mobile-info-card ${row.isViewer ? 'mobile-info-card-active' : ''}`}>
          <div className="mobile-info-card-head">
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
              <div>
                <strong>{row.name}</strong>
                <div className="muted small">Rank #{row.rank}</div>
              </div>
            </div>
            {row.isViewer ? <span className="dashboard-owner-badge">You</span> : null}
          </div>

          <div className="mobile-stat-grid">
            <div>
              <span className="label">Drivers</span>
              <strong>{row.drivers_owned}</strong>
            </div>
            <div>
              <span className="label">Spent</span>
              <strong>{fmtCents(row.total_spent_cents)}</strong>
            </div>
            <div>
              <span className="label">Earned</span>
              <strong>{fmtCents(row.total_earned_cents)}</strong>
            </div>
            <div>
              <span className="label">Net</span>
              <strong className={row.net_cents >= 0 ? 'text-pos' : 'text-neg'}>{fmtCents(row.net_cents)}</strong>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function formatBriefingHistoryLabel(briefing) {
  const eventName = briefing?.eventName || 'Saved Briefing';
  const phase = briefing?.phaseLabel || 'Saved';
  return `${eventName} • ${phase}`;
}

function BriefingHistoryNav({ history, selectedId, onSelect }) {
  if (!history?.length) return null;

  return (
    <div className="dashboard-briefing-history" role="tablist" aria-label="Briefing history">
      {history.map((entry) => (
        <button
          key={entry.id || `${entry.generatedAt || 'briefing'}-${entry.snapshotHash || ''}`}
          type="button"
          role="tab"
          aria-selected={selectedId === entry.id}
          className={`dashboard-briefing-nav-btn ${selectedId === entry.id ? 'active' : ''}`}
          onClick={() => onSelect(entry.id)}
        >
          <strong>{entry.eventName || 'Saved Briefing'}</strong>
          <span>{entry.phaseLabel || 'Saved'}{entry.generatedAt ? ` • ${fmtWhen(entry.generatedAt)}` : ''}</span>
        </button>
      ))}
    </div>
  );
}

function BriefingContent({ briefing }) {
  if (!briefing) {
    return <p className="muted">Generate a briefing when you want a concise race-and-standings summary.</p>;
  }

  return (
    <div className="dashboard-briefing-body">
      <div className="dashboard-briefing-meta">
        <div>
          <h3>{briefing.title || formatBriefingHistoryLabel(briefing)}</h3>
          <p className="muted small">
            {formatBriefingHistoryLabel(briefing)}
            {briefing.generatedAt ? ` • ${fmtWhen(briefing.generatedAt)}` : ''}
          </p>
        </div>
        <span className={`dashboard-payout-status ${briefing.phase || 'pending'}`}>{briefing.phaseLabel || 'Saved'}</span>
      </div>

      {briefing.summary ? <p className="dashboard-briefing-summary">{briefing.summary}</p> : null}

      {Array.isArray(briefing.sections) && briefing.sections.length ? (
        <div className="dashboard-briefing-sections">
          {briefing.sections.map((section) => (
            <section key={`${briefing.id || briefing.generatedAt}-${section.heading}`} className="dashboard-briefing-section">
              <h4>{section.heading}</h4>
              <ul>
                {(section.bullets || []).map((bullet) => (
                  <li key={`${section.heading}-${bullet}`}>{bullet}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : briefing.text ? (
        <p className="dashboard-briefing-text">{briefing.text}</p>
      ) : null}
    </div>
  );
}

export default function Dashboard() {
  const isMobileCards = useMediaQuery('(max-width: 760px)');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [briefingHistory, setBriefingHistory] = useState([]);
  const [selectedBriefingId, setSelectedBriefingId] = useState(null);
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
    const nextHistory = Array.isArray(payload?.briefingHistory)
      ? payload.briefingHistory
      : (payload?.briefing ? [payload.briefing] : []);
    setBriefingHistory(nextHistory);
    setSelectedBriefingId((currentId) => {
      if (currentId && nextHistory.some((entry) => entry.id === currentId)) return currentId;
      return nextHistory[0]?.id || null;
    });
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

      const nextHistory = Array.isArray(payload?.briefingHistory)
        ? payload.briefingHistory
        : (payload?.briefing ? [payload.briefing] : []);
      setBriefingHistory(nextHistory);
      setSelectedBriefingId(payload?.briefing?.id || nextHistory[0]?.id || null);
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
  const payoutBoard = data?.payoutBoard || { rules: [] };
  const isAdmin = !!data?.viewer?.isAdmin;
  const selectedBriefing = useMemo(
    () => briefingHistory.find((entry) => entry.id === selectedBriefingId) || briefingHistory[0] || null,
    [briefingHistory, selectedBriefingId],
  );
  const latestBriefing = briefingHistory[0] || null;

  const highlightedStandings = useMemo(() => standings.map((row, index) => ({
    ...row,
    rank: index + 1,
    net_cents: rowNet(row),
    isViewer: Number(row.id) === Number(data?.viewer?.id),
  })), [standings, data?.viewer?.id]);

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
              onClick={() => requestBriefing({ force: !!latestBriefing?.generatedAt })}
            >
              {briefingLoading ? 'Loading...' : (latestBriefing?.generatedAt ? 'Refresh Briefing' : 'Generate Briefing')}
            </button>
          </div>

          {!data?.briefingMeta?.available ? (
            <p className="muted">Anthropic is not configured for the F1 service yet.</p>
          ) : null}

          <BriefingHistoryNav
            history={briefingHistory}
            selectedId={selectedBriefing?.id || null}
            onSelect={setSelectedBriefingId}
          />

          <BriefingContent briefing={selectedBriefing} />

          {selectedBriefing?.generatedAt ? (
            <p className="muted small">
              {selectedBriefing.cached ? 'Cached' : 'Saved'} briefing
              {selectedBriefing.generatedAt ? ` • ${fmtWhen(selectedBriefing.generatedAt)}` : ''}.
            </p>
          ) : null}

          {briefingError ? <p className="error-text">{briefingError}</p> : null}
        </section>
      </div>

      <section className="panel stack dashboard-payout-board">
        <div className="dashboard-card-head">
          <div>
            <h2>Live Payout Board</h2>
            <p className="muted">
              Current holders for the active payout categories on this {primaryEvent ? eventTypeLabel(payoutBoard?.eventType || primaryEvent?.type) : 'scoring event'}.
            </p>
          </div>
          {!isAdmin ? (
            <Link className="btn btn-outline" to="/my-drivers">Open My Drivers</Link>
          ) : null}
        </div>

        {isMobileCards ? <PayoutBoardCards rules={payoutBoard.rules} /> : <PayoutBoardTable rules={payoutBoard.rules} />}
      </section>

      <section className="panel">
        <div className="dashboard-card-head">
          <div>
            <h2>Overall Standings</h2>
            <p className="muted">Full league table with spend, earnings, and current net position.</p>
          </div>
        </div>

        {error ? <p className="error-text">{error}</p> : null}

        {isMobileCards ? (
          <StandingsCards rows={highlightedStandings} />
        ) : (
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
        )}
      </section>
    </div>
  );
}
