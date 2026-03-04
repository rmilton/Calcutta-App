import React from 'react';
import { fmtCents } from '../../utils';
import useAdminOutletContext from './useAdminOutletContext';

export default function ResultsPage() {
  const { events, syncNext, syncEvent, loading, hasLoaded } = useAdminOutletContext();

  if (loading && !hasLoaded) {
    return <section className="loading-panel">Loading admin data...</section>;
  }

  return (
    <section className="panel stack">
      <div className="row between">
        <h2>Results Sync</h2>
        <button className="btn" onClick={syncNext}>Sync Next Event</button>
      </div>
      <ul className="list">
        {(events || []).map((event) => (
          <li key={event.id}>
            <div>
              <strong>R{event.round_number}</strong> {event.name}
              <div className="muted small">{event.type} • {event.status} • payout {fmtCents(event.total_payout_cents || 0)}</div>
            </div>
            <button className="btn btn-outline" onClick={() => syncEvent(event.id)}>Sync</button>
          </li>
        ))}
      </ul>
      {(!events || events.length === 0) ? <p className="muted small">No events available to sync.</p> : null}
    </section>
  );
}
