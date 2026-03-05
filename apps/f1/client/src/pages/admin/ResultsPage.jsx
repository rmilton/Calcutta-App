import React, { useCallback } from 'react';
import {
  eventTypeLabel,
  fmtCents,
} from '../../utils';
import useAdminOutletContext from './useAdminOutletContext';

export default function ResultsPage() {
  const {
    events,
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
    return <section className="loading-panel">Loading admin data...</section>;
  }

  return (
    <div className="stack-lg">
      <section className="panel stack">
        <div className="row between wrap gap-sm">
          <h2>Results Sync</h2>
          <div className="row wrap gap-sm">
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
