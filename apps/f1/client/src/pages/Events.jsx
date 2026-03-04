import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, categoryLabel, eventTypeLabel, fmtCents, fmtWhen } from '../utils';

export default function Events() {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [eventDetail, setEventDetail] = useState(null);

  const loadEvents = useCallback(async () => {
    const response = await api('/events');
    const data = await response.json();
    setEvents(data || []);
  }, []);

  const loadEvent = useCallback(async (eventId) => {
    const response = await api(`/events/${eventId}/payouts`);
    const data = await response.json();
    setEventDetail(data);
  }, []);

  useEffect(() => {
    loadEvents().catch(() => {});
  }, [loadEvents]);

  useEffect(() => {
    if (!selectedEvent) return;
    loadEvent(selectedEvent).catch(() => {});
  }, [selectedEvent, loadEvent]);

  const grouped = useMemo(() => {
    const map = new Map();
    events.forEach((event) => {
      const key = event.round_number;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(event);
    });
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [events]);

  return (
    <div className="two-col events-layout">
      <section className="panel">
        <h2>Race Weekends</h2>
        <div className="stack">
          {grouped.map(([round, weekendEvents]) => (
            <article key={round} className="event-weekend">
              <div className="weekend-label">Round {round}</div>
              {weekendEvents.map((event) => (
                <button
                  key={event.id}
                  className={`event-row ${selectedEvent === event.id ? 'active' : ''}`}
                  onClick={() => setSelectedEvent(event.id)}
                >
                  <div>
                    <strong>{event.name}</strong>
                    <div className="muted small">{fmtWhen(event.starts_at)}</div>
                  </div>
                  <div className="event-meta">
                    <span className={`event-type ${event.type}`}>{eventTypeLabel(event.type)}</span>
                    <span className="muted small">{fmtCents(event.total_payout_cents || 0)}</span>
                  </div>
                </button>
              ))}
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        {!eventDetail ? (
          <>
            <h2>Event Detail</h2>
            <p className="muted">Select an event to view results and payouts.</p>
          </>
        ) : (
          <>
            <h2>{eventDetail.event.name}</h2>
            <p className="muted">{eventTypeLabel(eventDetail.event.type)} • Random bonus position: {eventDetail.event.random_bonus_position || 'Pending draw'}</p>

            <h3>Results</h3>
            {eventDetail.results?.length ? (
              <ul className="list tight">
                {eventDetail.results.map((result) => (
                  <li key={result.id}>
                    <span>#{result.finish_position} {result.driver_code} ({result.driver_name})</span>
                    <span className="muted">Started {result.start_position ?? 'N/A'}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">No synced results yet.</p>}

            <h3>Payouts</h3>
            {eventDetail.payouts?.length ? (
              <ul className="list tight">
                {eventDetail.payouts.map((payout) => (
                  <li key={payout.id}>
                    <span>{payout.participant_name} • {categoryLabel(payout.category)}</span>
                    <strong>{fmtCents(payout.amount_cents)}</strong>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">No payouts yet.</p>}
          </>
        )}
      </section>
    </div>
  );
}
