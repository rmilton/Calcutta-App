import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  auditRuleSummary,
  categoryLabel,
  eventTypeLabel,
  fmtCents,
  fmtWhen,
} from '../../utils';
import AdminLoadingState from './AdminLoadingState';
import useAdminOutletContext from './useAdminOutletContext';

function fmtPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0.00%';
  return `${num.toFixed(2)}%`;
}

function ruleKey(rule) {
  return `${rule.category}:${rule.rank_order}`;
}

function winnerResultSummary(winner) {
  const finish = winner?.finish_position ?? 'N/A';
  const start = winner?.start_position ?? 'N/A';
  const gain = winner?.positions_gained;
  const gainText = gain == null || gain === '' ? 'N/A' : String(gain);
  const pitStop = Number(winner?.slowest_pit_stop_seconds);
  const pitText = Number.isFinite(pitStop) && pitStop > 0 ? ` Slowest stop ${pitStop.toFixed(3)}s.` : '';
  return `Finished ${finish}, started ${start}, gained ${gainText}.${pitText}`;
}

export default function PayoutAuditPage() {
  const { events, loading, hasLoaded } = useAdminOutletContext();
  const [selectedEventId, setSelectedEventId] = useState('');
  const [eventDetail, setEventDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [expandedRuleKey, setExpandedRuleKey] = useState('');

  useEffect(() => {
    if (!selectedEventId && events?.length) {
      setSelectedEventId(String(events[0].id));
    }
  }, [events, selectedEventId]);

  const selectedEvent = useMemo(
    () => (events || []).find((event) => String(event.id) === String(selectedEventId)) || null,
    [events, selectedEventId]
  );

  const loadEventAudit = useCallback(async (eventId) => {
    if (!eventId) {
      setEventDetail(null);
      setDetailError('');
      return;
    }

    setDetailLoading(true);
    setDetailError('');
    try {
      const response = await api(`/events/${eventId}/payouts`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load payout audit.');
      setEventDetail(data);
    } catch (error) {
      setEventDetail(null);
      setDetailError(error.message || 'Failed to load payout audit.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    setExpandedRuleKey('');
    if (!selectedEventId) return;
    loadEventAudit(selectedEventId);
  }, [selectedEventId, loadEventAudit]);

  if (loading && !hasLoaded) {
    return <AdminLoadingState />;
  }

  const audit = eventDetail?.payout_audit;

  return (
    <section className="panel stack-lg">
      <div className="row between wrap gap-sm">
        <div>
          <h2>Payout Audit</h2>
          <p className="muted small">Per-event payout rule resolution, split math, and distribution audit trail.</p>
        </div>
        <label>
          Event
          <select
            className="admin-event-select"
            value={selectedEventId}
            onChange={(event) => setSelectedEventId(event.target.value)}
          >
            <option value="">Select event</option>
            {(events || []).map((event) => (
              <option key={event.id} value={event.id}>
                R{event.round_number} {event.name} ({eventTypeLabel(event.type)})
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedEvent ? (
        <p className="muted small">
          {selectedEvent.name} • {eventTypeLabel(selectedEvent.type)} • {fmtWhen(selectedEvent.starts_at)}
        </p>
      ) : null}

      {detailLoading ? <p className="muted">Loading payout audit...</p> : null}
      {detailError ? <p className="error-text">{detailError}</p> : null}

      {!detailLoading && !detailError && audit ? (
        <>
          <section className="telemetry-strip">
            <div className="strip-item">
              <span className="label">Total Pot</span>
              <strong>{fmtCents(audit.total_pot_cents || 0)}</strong>
            </div>
            <div className="strip-item">
              <span className="label">Event Payout Total</span>
              <strong>{fmtCents(eventDetail?.event_payout_cents || 0)}</strong>
            </div>
            <div className="strip-item">
              <span className="label">Random Position</span>
              <strong>{audit.random_bonus_position || '—'}</strong>
            </div>
          </section>

          <ul className="audit-rule-list">
            {(audit.rules || []).map((rule) => {
              const currentRuleKey = ruleKey(rule);
              const isExpanded = expandedRuleKey === currentRuleKey;

              return (
                <li key={currentRuleKey} className="audit-rule-card">
                  <div className="audit-rule-head">
                    <div>
                      <strong>{categoryLabel(rule.category)}</strong>
                      <div className="muted small">
                        {rule.bps} bps • Pot {fmtCents(rule.category_pot_cents)} • {fmtPercent(rule.category_pct_of_pot)} of total pot
                      </div>
                    </div>
                    <div className="row wrap gap-sm">
                      <span className={`audit-status-pill audit-status-${rule.status}`}>{rule.status.replace('_', ' ')}</span>
                      <span className="bps-pill">{rule.winner_count} winner{rule.winner_count === 1 ? '' : 's'}</span>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => setExpandedRuleKey(isExpanded ? '' : currentRuleKey)}
                      >
                        {isExpanded ? 'Hide Details' : 'Details'}
                      </button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="audit-rule-detail stack">
                      <div className="row wrap gap-sm">
                        {rule.winner_count > 0 ? (
                          <span className="bps-pill">
                            Split basis {fmtCents(rule.category_pot_cents)} / {rule.winner_count}
                          </span>
                        ) : null}
                      </div>
                      <p className="muted small">
                        {auditRuleSummary(rule.category, { randomBonusPosition: audit.random_bonus_position })}
                      </p>
                      <p className="muted small">{rule.status_reason}</p>

                      {rule.winners?.length ? (
                        <ul className="audit-winner-list">
                          {rule.winners.map((winner) => (
                            <li key={`${currentRuleKey}:${winner.driver_id}`}>
                              <div>
                                <strong>{winner.driver_name || winner.driver_code || 'Driver'}</strong>
                                <div className="muted small">
                                  {winner.team_name || 'Team N/A'}
                                  {' • '}
                                  Finish {winner.finish_position ?? 'N/A'}
                                  {' • '}
                                  Start {winner.start_position ?? 'N/A'}
                                  {' • '}
                                  Gain {winner.positions_gained ?? 'N/A'}
                                  {Number.isFinite(Number(winner.slowest_pit_stop_seconds)) && Number(winner.slowest_pit_stop_seconds) > 0
                                    ? ` • Slowest stop ${Number(winner.slowest_pit_stop_seconds).toFixed(3)}s`
                                    : ''}
                                </div>
                                <div className="muted small">
                                  Owner: {winner.owner_participant_name || 'Unowned'}
                                </div>
                                <div className="muted small">{winnerResultSummary(winner)}</div>
                              </div>
                              <div className="audit-winner-values">
                                <span className="muted small">Split share {fmtCents(winner.split_share_cents)}</span>
                                <strong>{fmtCents(winner.received_cents)}</strong>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="muted small">No winners resolved for this rule.</p>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}
