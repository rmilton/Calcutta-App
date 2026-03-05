import React, { useCallback } from 'react';
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
        <ul className="list">
          {(events || []).map((event) => (
            <li key={event.id}>
              <div>
                <strong>R{event.round_number}</strong> {event.name}
                <div className="muted small">
                  {eventTypeLabel(event.type)} • {event.status} • payout {fmtCents(event.total_payout_cents || 0)}
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
        {(!events || events.length === 0) ? <p className="muted small">No events available to sync.</p> : null}
      </section>
    </div>
  );
}
