import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DriverIdentity from '../components/DriverIdentity';
import { getEventLocation } from '../eventLocations';
import {
  api,
  auditRuleSummary,
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

function fmtPct(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0.00%';
  return `${num.toFixed(2)}%`;
}

function winnerResultSummary(winner) {
  const finish = winner?.finish_position ?? 'N/A';
  const start = winner?.start_position ?? 'N/A';
  const gain = winner?.positions_gained;
  const gainText = gain == null || gain === '' ? 'N/A' : String(gain);
  return `Finished ${finish}, started ${start}, gained ${gainText}.`;
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
  const [expandedPayoutId, setExpandedPayoutId] = useState(null);

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
      const isScored = event.status === 'scored' || Number(event.result_count || 0) > 0;
      const isUpcomingByClock = startsAtMs != null && startsAtMs > now;
      return {
        ...event,
        startsAtMs,
        isScored,
        isUpcomingByClock,
        displayLocation: getEventLocation(event.name),
      };
    });

    const sortedBySchedule = [...enriched].sort((a, b) => (
      (a.round_number - b.round_number) || (typeOrder(a.type) - typeOrder(b.type))
    ));

    const upcomingEvents = sortedBySchedule
      .filter((event) => !event.isScored)
      .sort((a, b) => {
        const aFuture = a.startsAtMs != null && a.startsAtMs > now;
        const bFuture = b.startsAtMs != null && b.startsAtMs > now;
        if (aFuture !== bFuture) return aFuture ? -1 : 1;
        if (a.startsAtMs == null && b.startsAtMs == null) {
          return (a.round_number - b.round_number) || (typeOrder(a.type) - typeOrder(b.type));
        }
        if (a.startsAtMs == null) return 1;
        if (b.startsAtMs == null) return -1;
        if (a.startsAtMs !== b.startsAtMs) return a.startsAtMs - b.startsAtMs;
        return (a.round_number - b.round_number) || (typeOrder(a.type) - typeOrder(b.type));
      });

    const pastEvents = sortedBySchedule
      .filter((event) => event.isScored)
      .sort((a, b) => {
        if (a.startsAtMs == null && b.startsAtMs == null) {
          return (b.round_number - a.round_number) || (typeOrder(a.type) - typeOrder(b.type));
        }
        if (a.startsAtMs == null) return 1;
        if (b.startsAtMs == null) return -1;
        if (b.startsAtMs !== a.startsAtMs) return b.startsAtMs - a.startsAtMs;
        return (b.round_number - a.round_number) || (typeOrder(a.type) - typeOrder(b.type));
      });

    const nextUpcomingEvent = upcomingEvents.find((event) => event.isUpcomingByClock) || null;
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
    setExpandedPayoutId(null);
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
    setExpandedPayoutId(null);
  }, []);

  const findAuditRuleForPayout = useCallback((payout) => {
    const auditRules = eventDetail?.payout_audit?.rules || [];
    const categoryMatches = auditRules.filter((rule) => rule.category === payout.category);
    if (!categoryMatches.length) return null;

    const directMatch = categoryMatches.find((rule) => (rule.winners || []).some((winner) => (
      Number(winner.driver_id) === Number(payout.driver_id)
      && Number(winner.owner_participant_id) === Number(payout.participant_id)
      && Number(winner.received_cents) === Number(payout.amount_cents)
    )));

    return directMatch || categoryMatches[0];
  }, [eventDetail]);

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
                        <li key={payout.id} className={`events-payout-row ${expandedPayoutId === payout.id ? 'expanded' : ''}`}>
                          <div className="events-payout-row-head">
                            <span>
                              {payout.participant_name}
                              {' • '}
                              {categoryLabel(payout.category)}
                              {payout.category === 'random_finish_bonus' && eventDetail.event?.random_bonus_position
                                ? ` (${ordinal(eventDetail.event.random_bonus_position)})`
                                : ''}
                            </span>
                            <div className="events-payout-controls">
                              <span className="events-payout-amount">
                                <strong>{fmtCents(payout.amount_cents)}</strong>
                                <span className="muted small">{pctOfTotal(payout.amount_cents, eventDetail.total_pot_cents)} of pot</span>
                              </span>
                              <button
                                type="button"
                                className="btn btn-outline events-why-btn"
                                onClick={() => setExpandedPayoutId((prev) => (prev === payout.id ? null : payout.id))}
                              >
                                {expandedPayoutId === payout.id ? 'Hide Why' : 'Why'}
                              </button>
                            </div>
                          </div>

                          {expandedPayoutId === payout.id ? (
                            (() => {
                              const rule = findAuditRuleForPayout(payout);
                              if (!rule) {
                                return <p className="muted small events-payout-audit-inline">Audit details unavailable for this payout.</p>;
                              }

                              const isCurrentWinner = (winner) => (
                                Number(winner.driver_id) === Number(payout.driver_id)
                                && Number(winner.owner_participant_id) === Number(payout.participant_id)
                                && Number(winner.received_cents) === Number(payout.amount_cents)
                              );

                              return (
                                <div className="events-payout-audit-inline stack">
                                  <div className="row wrap gap-sm">
                                    <span className="bps-pill">{rule.bps} bps</span>
                                    <span className="bps-pill">Rule pot {fmtCents(rule.category_pot_cents)}</span>
                                    <span className="bps-pill">{fmtPct(rule.category_pct_of_pot)} of total pot</span>
                                    <span className={`audit-status-pill audit-status-${rule.status}`}>{rule.status.replace('_', ' ')}</span>
                                  </div>
                                  <p className="muted small">
                                    {auditRuleSummary(rule.category, { randomBonusPosition: eventDetail?.event?.random_bonus_position })}
                                  </p>
                                  <p className="muted small">{rule.status_reason}</p>
                                  {rule.winners?.length ? (
                                    <ul className="events-audit-winners">
                                      {rule.winners.map((winner) => (
                                        <li
                                          key={`${rule.category}:${rule.rank_order}:${winner.driver_id}:${winner.owner_participant_id || 'none'}`}
                                          className={isCurrentWinner(winner) ? 'current' : ''}
                                        >
                                          <div>
                                            <strong>{winner.driver_name || winner.driver_code || 'Driver'}</strong>
                                            <div className="muted small">
                                              {winner.team_name || 'Team N/A'}
                                              {' • '}
                                              Owner {winner.owner_participant_name || 'Unowned'}
                                            </div>
                                            <div className="muted small">{winnerResultSummary(winner)}</div>
                                          </div>
                                          <div className="events-audit-winner-values">
                                            <span className="muted small">Share {fmtCents(winner.split_share_cents)}</span>
                                            <strong>{fmtCents(winner.received_cents)}</strong>
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="muted small">No winners resolved for this rule.</p>
                                  )}
                                </div>
                              );
                            })()
                          ) : null}
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
