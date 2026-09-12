import React from 'react';
import { categoryLabel, eventTypeLabel, fmtCents } from '../../utils';
import { unallocatedPotExportHref } from './adminApi';
import AdminLoadingState from './AdminLoadingState';
import useAdminOutletContext from './useAdminOutletContext';

function UnownedWinnerLine({ winners }) {
  if (!Array.isArray(winners) || !winners.length) return null;
  return (
    <div className="muted small">
      Unowned: {winners
        .map((winner) => `${winner.driverName || winner.driverCode || 'Driver'}${winner.teamName ? ` (${winner.teamName})` : ''}`)
        .join(', ')}
    </div>
  );
}

export function UnallocatedPotContent({ unallocatedPot, loading, hasLoaded }) {
  if (loading && !hasLoaded) {
    return <AdminLoadingState />;
  }

  if (!unallocatedPot) {
    return <p className="muted">Unallocated pot data is unavailable right now.</p>;
  }

  const {
    totalCents = 0,
    eventCents = 0,
    seasonBonus = {},
    contributingEvents = [],
    isFinal = false,
    scoredEventCount = 0,
    scoringEventCount = 0,
  } = unallocatedPot;

  return (
    <div className="stack-lg">
      <div className="row between wrap gap-sm">
        <div>
          <h2>Unallocated Pot</h2>
          <p className="muted small">
            Payout value the rules earmarked but never disbursed — category winners nobody owns
            (substitutes, stand-ins) and categories no driver satisfied. Held aside for a
            season-end decision.
          </p>
        </div>
        <a className="btn btn-outline" href={unallocatedPotExportHref()}>Download CSV</a>
      </div>

      <section className="telemetry-strip">
        <div className="strip-item">
          <span className="label">Total Unallocated</span>
          <strong>{fmtCents(totalCents)}</strong>
        </div>
        <div className="strip-item">
          <span className="label">From Races &amp; Sprints</span>
          <strong>{fmtCents(eventCents)}</strong>
        </div>
        <div className="strip-item">
          <span className="label">From Season Bonuses</span>
          <strong>{seasonBonus.resolved ? fmtCents(seasonBonus.unallocatedCents || 0) : 'Pending'}</strong>
        </div>
        <div className="strip-item">
          <span className="label">Season Scored</span>
          <strong>{scoredEventCount}/{scoringEventCount}</strong>
        </div>
      </section>

      <div className={`note-panel ${isFinal ? '' : 'note-panel-warning'}`}>
        <strong>{isFinal ? 'Season complete' : 'Running total'}</strong>
        <div className="muted small">
          {isFinal
            ? 'Every scoring event is scored. This figure is final unless events are re-synced or ownership changes.'
            : 'This recalculates as races are scored and can still move up or down.'}
        </div>
      </div>

      <section className="panel stack">
        <h3>Season bonuses</h3>
        {seasonBonus.resolved ? (
          <>
            <p className="muted small">{seasonBonus.reason}</p>
            {(seasonBonus.categories || []).length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Category</th><th>Pot</th><th>Paid</th><th>Unallocated</th><th>Detail</th></tr>
                  </thead>
                  <tbody>
                    {seasonBonus.categories.map((category) => (
                      <tr key={category.category}>
                        <td>{categoryLabel(category.category)}</td>
                        <td>{fmtCents(category.potCents)}</td>
                        <td>{fmtCents(category.paidCents)}</td>
                        <td>{fmtCents(category.unallocatedCents)}</td>
                        <td>
                          <div className="muted small">{category.statusReason}</div>
                          <UnownedWinnerLine winners={category.unownedWinners} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted small">No season bonus value went unallocated.</p>
            )}
          </>
        ) : (
          <p className="muted small">{seasonBonus.reason}</p>
        )}
      </section>

      <section className="panel stack">
        <h3>Races &amp; sprints</h3>
        {contributingEvents.length ? (
          contributingEvents.map((event) => (
            <div key={event.eventId} className="stack-sm">
              <div className="row between wrap gap-sm">
                <strong>R{event.roundNumber} {event.name} <span className="muted small">· {eventTypeLabel(event.type)}</span></strong>
                <span className="bps-pill warn">{fmtCents(event.unallocatedCents)} unallocated</span>
              </div>
              {event.categories.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Category</th><th>Pot</th><th>Paid</th><th>Unallocated</th><th>Detail</th></tr>
                    </thead>
                    <tbody>
                      {event.categories.map((category) => (
                        <tr key={`${event.eventId}:${category.category}`}>
                          <td>{categoryLabel(category.category)}</td>
                          <td>{fmtCents(category.potCents)}</td>
                          <td>{fmtCents(category.paidCents)}</td>
                          <td>{fmtCents(category.unallocatedCents)}</td>
                          <td>
                            <div className="muted small">{category.statusReason}</div>
                            <UnownedWinnerLine winners={category.unownedWinners} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted small">
                  Event pool {fmtCents(event.potCents)} vs paid {fmtCents(event.paidCents)}; category detail unavailable.
                </p>
              )}
            </div>
          ))
        ) : (
          <p className="muted small">No race or sprint value has gone unallocated yet.</p>
        )}
      </section>
    </div>
  );
}

export default function UnallocatedPotPage() {
  const { unallocatedPot, loading, hasLoaded } = useAdminOutletContext();
  return (
    <section className="panel stack-lg">
      <UnallocatedPotContent unallocatedPot={unallocatedPot} loading={loading} hasLoaded={hasLoaded} />
    </section>
  );
}
