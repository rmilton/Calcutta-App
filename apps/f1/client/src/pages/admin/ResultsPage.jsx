import React, { useCallback, useMemo } from 'react';
import {
  eventTypeLabel,
  fmtCents,
} from '../../utils';
import AdminLoadingState from './AdminLoadingState';
import useAdminOutletContext from './useAdminOutletContext';

function stateLabel(state) {
  if (!state?.status) return 'Not run';
  return String(state.status).replace(/_/g, ' ');
}

function formatEventTime(value) {
  if (!value) return 'TBD';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'TBD';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRefreshTime(value) {
  if (!value) return 'Not refreshed yet';
  const numeric = Number(value);
  const date = Number.isFinite(numeric) && String(value).trim() !== ''
    ? new Date(numeric)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not refreshed yet';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ResultsPage() {
  const {
    events,
    providerStatus,
    refreshDrivers,
    refreshSchedule,
    syncNext,
    syncEvent,
    refresh,
    loading,
    hasLoaded,
  } = useAdminOutletContext();

  const runAndReload = useCallback(async (runner) => {
    await runner();
    await refresh();
  }, [refresh]);

  const refreshedDrivers = useMemo(
    () => Array.isArray(providerStatus?.last_driver_refresh?.drivers) ? providerStatus.last_driver_refresh.drivers : [],
    [providerStatus]
  );

  if (loading && !hasLoaded) {
    return <AdminLoadingState />;
  }

  return (
    <div className="stack-lg">
      <section className="panel stack">
        <div className="row between wrap gap-sm">
          <h2>Results Sync</h2>
          <div className="row wrap gap-sm">
            <button
              className="btn btn-outline"
              onClick={() => runAndReload(() => refreshDrivers())}
            >
              Refresh Drivers
            </button>
            <button
              className="btn btn-outline"
              onClick={() => runAndReload(() => refreshSchedule())}
            >
              Refresh Schedule
            </button>
            <button
              className="btn"
              onClick={() => runAndReload(() => syncNext())}
            >
              Sync Next Available
            </button>
            <button
              className="btn btn-outline"
              onClick={() => runAndReload(() => syncNext({ force: true }))}
            >
              Advance Next (Force)
            </button>
          </div>
        </div>
        <div className="grid-3 results-provider-grid">
          <div className="strip-item">
            <span className="label">Active Provider</span>
            <strong>{providerStatus?.provider || 'unknown'}</strong>
            <span className="muted small">
              {providerStatus?.provider_info?.error || providerStatus?.provider_info?.baseUrl || providerStatus?.mode || '—'}
            </span>
          </div>
          <div className="strip-item">
            <span className="label">Driver Refresh</span>
            <strong>{stateLabel(providerStatus?.last_driver_refresh)}</strong>
            <span className="muted small">
              {providerStatus?.last_driver_refresh?.message || 'No driver refresh recorded yet.'}
            </span>
          </div>
          <div className="strip-item">
            <span className="label">Schedule Refresh</span>
            <strong>{stateLabel(providerStatus?.last_schedule_refresh)}</strong>
            <span className="muted small">
              {providerStatus?.last_schedule_refresh?.message || 'No schedule refresh recorded yet.'}
            </span>
          </div>
          <div className="strip-item">
            <span className="label">Auto Poll</span>
            <strong>{providerStatus?.auto_poll?.enabled ? 'Enabled' : 'Disabled'}</strong>
            <span className="muted small">
              {providerStatus?.auto_poll?.message
                || (providerStatus?.auto_poll?.enabled
                  ? `Running every ${providerStatus?.auto_poll?.intervalSeconds || 0}s.`
                  : 'Auto-poll is off.')}
            </span>
          </div>
        </div>
        <div className="stack">
          <details className="admin-collapsible" open={refreshedDrivers.length > 0}>
            <summary className="admin-collapsible-summary">
              <div>
                <strong>Refreshed Drivers</strong>
                <div className="muted small">
                  {refreshedDrivers.length
                    ? `${refreshedDrivers.length} drivers from the latest refresh.`
                    : 'No successful driver refresh recorded yet.'}
                </div>
              </div>
              <div className="admin-collapsible-meta">
                <span className="admin-collapsible-time">
                  {formatRefreshTime(providerStatus?.last_driver_refresh?.updated_at)}
                </span>
                <span className="admin-collapsible-count">{refreshedDrivers.length}</span>
              </div>
            </summary>
            {refreshedDrivers.length ? (
              <ul className="list admin-sync-list">
                {refreshedDrivers.map((driver) => (
                  <li key={`${driver.external_id}-${driver.code || driver.name}`}>
                    <div>
                      <strong>{driver.name}</strong>
                      <div className="muted small">
                        {driver.code} • {driver.team_name}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Run `Refresh Drivers` to inspect the provider driver list here.</p>
            )}
          </details>

          <details className="admin-collapsible" open={Boolean(events?.length)}>
            <summary className="admin-collapsible-summary">
              <div>
                <strong>Season Events</strong>
                <div className="muted small">
                  Current F1 event list for sync, review, and force-sync actions.
                </div>
              </div>
              <div className="admin-collapsible-meta">
                <span className="admin-collapsible-time">
                  {formatRefreshTime(providerStatus?.last_schedule_refresh?.updated_at)}
                </span>
                <span className="admin-collapsible-count">{events?.length || 0}</span>
              </div>
            </summary>
            {events?.length ? (
              <ul className="list admin-sync-list">
                {events.map((event) => (
                  <li key={event.id}>
                    <div>
                      <strong>R{event.round_number}</strong> {event.name}
                      <div className="muted small">
                        {eventTypeLabel(event.type)} • {event.status} • {formatEventTime(event.starts_at)} • payout {fmtCents(event.total_payout_cents || 0)}
                      </div>
                    </div>
                    <div className="row wrap gap-sm">
                      <button
                        className="btn btn-outline"
                        onClick={() => runAndReload(() => syncEvent(event.id))}
                      >
                        Sync
                      </button>
                      <button
                        className="btn btn-outline"
                        onClick={() => runAndReload(() => syncEvent(event.id, { force: true }))}
                      >
                        Force Sync
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">No events available to sync.</p>
            )}
          </details>
        </div>
      </section>
    </div>
  );
}
