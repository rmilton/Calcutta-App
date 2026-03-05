import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DriverIdentity from '../components/DriverIdentity';
import { getEventLocation } from '../eventLocations';
import {
  api,
  categoryLabel,
  eventTypeLabel,
  fmtCents,
  fmtWhen,
  toTimestampMs,
} from '../utils';

const UPCOMING_SWITCH_WINDOW_MS = 48 * 60 * 60 * 1000;

function ordinal(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 1) return '';
  const mod100 = num % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${num}th`;
  switch (num % 10) {
    case 1: return `${num}st`;
    case 2: return `${num}nd`;
    case 3: return `${num}rd`;
    default: return `${num}th`;
  }
}

function typeOrder(type) {
  return type === 'sprint' ? 0 : 1;
}

function statusLabel(status, isScored) {
  if (isScored) return 'Scored';
  if (!status) return 'Pending';
  if (status === 'pending') return 'Pending';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function pctOfTotal(amountCents, totalPotCents) {
  const total = Number(totalPotCents || 0);
  if (total <= 0) return '0.00%';
  const pct = (Number(amountCents || 0) / total) * 100;
  return `${pct.toFixed(2)}%`;
}

export default function Events() {
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [hasUserSelection, setHasUserSelection] = useState(false);
  const [raceListMode, setRaceListMode] = useState('upcoming');
  const [hasUserListModeChoice, setHasUserListModeChoice] = useState(false);
  const [eventDetail, setEventDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('payouts');

  const loadEvents = useCallback(async () => {
    const response = await api('/events');
    const data = await response.json();
    setEvents(Array.isArray(data) ? data : []);
  }, []);

  const loadEventDetail = useCallback(async (eventId) => {
    if (!eventId) {
      setEventDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const response = await api(`/events/${eventId}/payouts`);
      const data = await response.json();
      setEventDetail(data);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents().catch(() => {});
  }, [loadEvents]);

  const eventView = useMemo(() => {
    const now = Date.now();
    const enriched = events.map((event) => {
      const startsAtMs = toTimestampMs(event.starts_at);
      const isUpcoming = startsAtMs != null && startsAtMs > now;
      const isScored = event.status === 'scored' || Number(event.result_count || 0) > 0;
      return {
        ...event,
        startsAtMs,
        isUpcoming,
        isPast: !isUpcoming,
        isScored,
        displayLocation: getEventLocation(event.name),
      };
    });

    const sortedBySchedule = [...enriched].sort((a, b) => (
      (a.round_number - b.round_number) || (typeOrder(a.type) - typeOrder(b.type))
    ));

    const upcomingEvents = sortedBySchedule
      .filter((event) => event.isUpcoming)
      .sort((a, b) => {
        if (a.startsAtMs == null && b.startsAtMs == null) return 0;
        if (a.startsAtMs == null) return 1;
        if (b.startsAtMs == null) return -1;
        return a.startsAtMs - b.startsAtMs;
      });

    const pastEvents = sortedBySchedule
      .filter((event) => !event.isUpcoming)
      .sort((a, b) => {
        if (a.startsAtMs == null && b.startsAtMs == null) {
          return (b.round_number - a.round_number) || (typeOrder(a.type) - typeOrder(b.type));
        }
        if (a.startsAtMs == null) return 1;
        if (b.startsAtMs == null) return -1;
        if (b.startsAtMs !== a.startsAtMs) return b.startsAtMs - a.startsAtMs;
        return (b.round_number - a.round_number) || (typeOrder(a.type) - typeOrder(b.type));
      });

    const nextUpcomingEvent = upcomingEvents[0] || null;
    const mostRecentScoredEvent = [...pastEvents].find((event) => event.isScored) || null;

    const selectUpcomingWindow = (
      nextUpcomingEvent
      && nextUpcomingEvent.startsAtMs != null
      && now >= (nextUpcomingEvent.startsAtMs - UPCOMING_SWITCH_WINDOW_MS)
    );

    const recommendedEventId = selectUpcomingWindow
      ? nextUpcomingEvent.id
      : (mostRecentScoredEvent?.id || nextUpcomingEvent?.id || sortedBySchedule[0]?.id || null);

    const recommendedListMode = upcomingEvents.some((event) => event.id === recommendedEventId)
      ? 'upcoming'
      : 'past';

    return {
      sortedBySchedule,
      upcomingEvents,
      pastEvents,
      recommendedEventId,
      recommendedListMode,
    };
  }, [events]);

  useEffect(() => {
    if (!eventView.sortedBySchedule.length) {
      setSelectedEventId(null);
      setEventDetail(null);
      return;
    }

    const selectedStillExists = selectedEventId != null
      && eventView.sortedBySchedule.some((event) => event.id === selectedEventId);

    if (hasUserSelection && selectedStillExists) return;
    if (selectedStillExists && selectedEventId === eventView.recommendedEventId) return;

    setSelectedEventId(eventView.recommendedEventId);
    if (!hasUserListModeChoice) setRaceListMode(eventView.recommendedListMode);
    setActiveTab('payouts');
  }, [eventView, selectedEventId, hasUserSelection, hasUserListModeChoice]);

  useEffect(() => {
    if (!selectedEventId) return;
    loadEventDetail(selectedEventId).catch(() => {});
  }, [selectedEventId, loadEventDetail]);

  const selectedEventSummary = useMemo(
    () => eventView.sortedBySchedule.find((event) => event.id === selectedEventId) || null,
    [eventView.sortedBySchedule, selectedEventId]
  );

  const handleSelectEvent = useCallback((eventId) => {
    setSelectedEventId(eventId);
    setHasUserSelection(true);
    setActiveTab('payouts');
  }, []);

  const visibleEvents = raceListMode === 'upcoming'
    ? eventView.upcomingEvents
    : eventView.pastEvents;

  return (
    <div className="two-col events-layout events-redesign">
      <section className="panel events-navigator">
        <div className="events-nav-header">
          <h2>Race Weekends</h2>
          <span className="muted small">{eventView.sortedBySchedule.length} events</span>
        </div>

        <div className="events-list-toggle" role="tablist" aria-label="Race list mode">
          <button
            className={`events-list-toggle-btn ${raceListMode === 'upcoming' ? 'active' : ''}`}
            role="tab"
            aria-selected={raceListMode === 'upcoming'}
            onClick={() => {
              setRaceListMode('upcoming');
              setHasUserListModeChoice(true);
            }}
          >
            Upcoming
            <span>{eventView.upcomingEvents.length}</span>
          </button>
          <button
            className={`events-list-toggle-btn ${raceListMode === 'past' ? 'active' : ''}`}
            role="tab"
            aria-selected={raceListMode === 'past'}
            onClick={() => {
              setRaceListMode('past');
              setHasUserListModeChoice(true);
            }}
          >
            Past
            <span>{eventView.pastEvents.length}</span>
          </button>
        </div>

        <section className="events-section">
          <div className="events-section-head">
            <h3>{raceListMode === 'upcoming' ? 'Upcoming Races' : 'Past Races'}</h3>
            <span className="muted small">{visibleEvents.length}</span>
          </div>
          {visibleEvents.length ? (
            <ul className="events-list">
              {visibleEvents.map((event) => (
                <li key={event.id}>
                  <button
                    className={`event-nav-row ${selectedEventId === event.id ? 'active' : ''}`}
                    onClick={() => handleSelectEvent(event.id)}
                  >
                    <div className="event-nav-main">
                      <strong>{event.name}</strong>
                      <div className="event-nav-meta muted small">
                        {fmtWhen(event.starts_at)} • {event.displayLocation}
                      </div>
                    </div>
                    <div className="event-nav-side">
                      <span className={`event-type ${event.type}`}>{eventTypeLabel(event.type)}</span>
                      <span className="muted small">{fmtCents(event.total_payout_cents || 0)}</span>
                      <span className={`event-status event-status-${event.status || 'pending'}`}>
                        {statusLabel(event.status, event.isScored)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">
              {raceListMode === 'upcoming' ? 'No upcoming races found.' : 'No past races found.'}
            </p>
          )}
        </section>
      </section>

      <section className="panel events-detail-shell">
        {!selectedEventSummary ? (
          <>
            <h2>Event Detail</h2>
            <p className="muted">Select an event to view results and payouts.</p>
          </>
        ) : (
          <>
            <header className="events-detail-header">
              <h2>{selectedEventSummary.name}</h2>
              <p className="muted">
                {eventTypeLabel(selectedEventSummary.type)} • {fmtWhen(selectedEventSummary.starts_at)} • {selectedEventSummary.displayLocation}
              </p>
              <p className="muted small">
                {statusLabel(selectedEventSummary.status, selectedEventSummary.isScored)}
                {eventDetail?.event?.random_bonus_position
                  ? ` • Random bonus position: ${ordinal(eventDetail.event.random_bonus_position)}`
                  : ''}
              </p>
            </header>

            <nav className="events-detail-tabs" aria-label="Event details">
              <button
                className={`events-tab ${activeTab === 'payouts' ? 'active' : ''}`}
                onClick={() => setActiveTab('payouts')}
              >
                Payouts
              </button>
              <button
                className={`events-tab ${activeTab === 'results' ? 'active' : ''}`}
                onClick={() => setActiveTab('results')}
              >
                Results
              </button>
            </nav>

            <div className="events-detail-body">
              {detailLoading ? <p className="muted">Loading event detail...</p> : null}

              {!detailLoading && !eventDetail ? (
                <p className="muted">Event details unavailable.</p>
              ) : null}

              {!detailLoading && eventDetail && activeTab === 'payouts' ? (
                <>
                  <div className="events-payout-summary">
                    <div className="events-pot-kpi">
                      <span className="label">Race Pot</span>
                      <strong>{fmtCents(eventDetail.event_payout_cents ?? eventDetail.event?.total_payout_cents ?? 0)}</strong>
                    </div>
                    <div className="events-pot-kpi">
                      <span className="label">Total Pot</span>
                      <strong>{fmtCents(eventDetail.total_pot_cents || 0)}</strong>
                    </div>
                  </div>
                  {eventDetail.payouts?.length ? (
                    <ul className="list tight">
                      {eventDetail.payouts.map((payout) => (
                        <li key={payout.id}>
                          <span>
                            {payout.participant_name}
                            {' • '}
                            {categoryLabel(payout.category)}
                            {payout.category === 'random_finish_bonus' && eventDetail.event?.random_bonus_position
                              ? ` (${ordinal(eventDetail.event.random_bonus_position)})`
                              : ''}
                          </span>
                          <span className="events-payout-amount">
                            <strong>{fmtCents(payout.amount_cents)}</strong>
                            <span className="muted small">{pctOfTotal(payout.amount_cents, eventDetail.total_pot_cents)} of pot</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="muted">No payouts yet.</p>}
                </>
              ) : null}

              {!detailLoading && eventDetail && activeTab === 'results' ? (
                <>
                  {eventDetail.results?.length ? (
                    <ul className="list tight">
                      {eventDetail.results.map((result) => (
                        <li key={result.id}>
                          <span className="row gap-sm">
                            <strong>#{result.finish_position}</strong>
                            <DriverIdentity
                              driverName={result.driver_name}
                              driverCode={result.driver_code}
                              teamName={result.team_name}
                              compact
                              showCode={false}
                              showTeam
                            />
                          </span>
                          <span className="muted">Started {result.start_position ?? 'N/A'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="muted">No synced results yet.</p>}
                </>
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
