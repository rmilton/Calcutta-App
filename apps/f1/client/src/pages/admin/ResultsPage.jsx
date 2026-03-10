import React, { useCallback, useMemo } from 'react';
import {
  eventTypeLabel,
  fmtCents,
} from '../../utils';
import { databaseBackupHref } from './adminApi';
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

function ordinal(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const mod100 = number % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${number}th`;
  const mod10 = number % 10;
  if (mod10 === 1) return `${number}st`;
  if (mod10 === 2) return `${number}nd`;
  if (mod10 === 3) return `${number}rd`;
  return `${number}th`;
}

function fmtBps(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
}

function confirmEventCancellation(eventName) {
  const confirmed = window.confirm(`Mark ${eventName} as cancelled and redistribute its payout value?`);
  if (!confirmed) return false;

  const confirmationText = window.prompt('Type CANCEL to confirm this event should be marked cancelled.', '');
  return confirmationText === 'CANCEL';
}

export default function ResultsPage() {
  const {
    events,
    providerStatus,
    refreshDrivers,
    refreshSchedule,
    syncNext,
    syncEvent,
    drawRandomPosition,
    cancelEvent,
    restoreEvent,
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
  const driverRosterGuard = providerStatus?.driver_roster_guard || null;
  const isDriverRosterFrozen = Boolean(driverRosterGuard?.frozen);
  const cancellationSummary = useMemo(() => {
    const cancelledEvents = (events || []).filter((event) => event.status === 'cancelled');
    const gpCount = cancelledEvents.filter((event) => event.type === 'grand_prix').length;
    const sprintCount = cancelledEvents.filter((event) => event.type === 'sprint').length;
    const bonusRolloverCents = cancelledEvents.reduce(
      (sum, event) => sum + Number(event.rolled_to_season_bonus_cents || 0),
      0,
    );

    return {
      gpCount,
      sprintCount,
      bonusRolloverCents,
    };
  }, [events]);

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
              disabled={isDriverRosterFrozen}
              title={isDriverRosterFrozen ? driverRosterGuard?.message : 'Refresh drivers from the results provider'}
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
            <a className="btn btn-outline" href={databaseBackupHref()}>
              Download DB Backup
            </a>
          </div>
        </div>
        <div className={`note-panel ${isDriverRosterFrozen ? 'note-panel-warning' : ''}`}>
          <strong>Driver Roster {isDriverRosterFrozen ? 'Frozen' : 'Open'}</strong>
          <div className="muted small">
            {driverRosterGuard?.message || 'Driver roster guard unavailable.'}
          </div>
          {isDriverRosterFrozen ? (
            <div className="muted small">
              Activity counts: bids {driverRosterGuard?.season_activity?.bids || 0}, ownership {driverRosterGuard?.season_activity?.ownership || 0}, results {driverRosterGuard?.season_activity?.eventResults || 0}, event payouts {driverRosterGuard?.season_activity?.eventPayouts || 0}.
            </div>
          ) : null}
        </div>
        <div className={`note-panel ${(cancellationSummary.gpCount || cancellationSummary.sprintCount) ? 'note-panel-warning' : ''}`}>
          <strong>Cancellation Summary</strong>
          <div className="muted small">
            Cancelled grand prix events: {cancellationSummary.gpCount}. Cancelled sprint events: {cancellationSummary.sprintCount}.
          </div>
          <div className="muted small">
            Future unscored events already include same-type redistribution in their effective payout preview.
            {' '}
            {cancellationSummary.bonusRolloverCents
              ? `${fmtCents(cancellationSummary.bonusRolloverCents)} currently rolls into season bonuses because no same-type events remain.`
              : 'No cancelled-event value is currently rolling into season bonuses.'}
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
                      {event.status !== 'scored' && event.status !== 'cancelled' ? (
                        <div className="muted small">
                          Base {fmtBps(event.base_total_bps)} bps • Effective {fmtBps(event.effective_total_bps)} bps • Redistributed in {fmtCents(event.redistributed_pool_cents || 0)}
                        </div>
                      ) : null}
                      {event.status === 'cancelled' ? (
                        <div className="muted small">
                          Cancelled payout value: {fmtCents(event.redistributed_outbound_cents || 0)}
                          {event.rolled_to_season_bonus_cents
                            ? ` • Season bonus rollover ${fmtCents(event.rolled_to_season_bonus_cents)}`
                            : ' • Reassigned to future same-type events'}
                        </div>
                      ) : null}
                      <div className="muted small">
                        Random bonus: {event.random_bonus_position ? ordinal(event.random_bonus_position) : 'Not drawn yet'}
                      </div>
                      {event.status !== 'scored' && event.status !== 'cancelled' && event.payout_preview_rules?.length ? (
                        <details className="admin-collapsible">
                          <summary className="admin-collapsible-summary">
                            <div>
                              <strong>Payout BPS Structure</strong>
                              <div className="muted small">
                                {event.payout_preview_rules.length} categories. Collapsed by default to keep the event list shorter.
                              </div>
                            </div>
                          </summary>
                          <ul className="list tight muted small">
                            {event.payout_preview_rules.map((rule) => (
                              <li key={`${event.id}:${rule.category}:${rule.rank_order}`}>
                                {rule.label}: {fmtCents(rule.category_pot_cents)} ({rule.base_bps} bps
                                {Number(rule.redistributed_cents || 0) > 0 ? ` + ${fmtCents(rule.redistributed_cents)}` : ''})
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                    <div className="row wrap gap-sm admin-event-actions">
                      <button
                        className="btn btn-outline"
                        onClick={() => runAndReload(() => drawRandomPosition(event.id))}
                        disabled={Boolean(event.random_bonus_position) || event.status === 'cancelled' || event.status === 'scored'}
                        title={event.random_bonus_position ? `Random bonus already drawn at ${ordinal(event.random_bonus_position)}.` : 'Draw and persist the random bonus position before the race starts'}
                      >
                        {event.random_bonus_position ? `Random ${ordinal(event.random_bonus_position)}` : 'Draw Random'}
                      </button>
                      {event.status === 'cancelled' ? (
                        <button
                          className="btn btn-outline"
                          onClick={() => runAndReload(() => restoreEvent(event.id))}
                        >
                          Restore
                        </button>
                      ) : (
                        <>
                          <button
                            className="btn btn-outline"
                            onClick={() => runAndReload(() => syncEvent(event.id))}
                            disabled={event.status === 'scored'}
                          >
                            Sync
                          </button>
                          <button
                            className="btn btn-outline"
                            onClick={() => runAndReload(() => syncEvent(event.id, { force: true }))}
                            disabled={event.status === 'scored'}
                          >
                            Force Sync
                          </button>
                          <button
                            className="btn btn-outline"
                            onClick={() => {
                              const confirmed = confirmEventCancellation(event.name);
                              if (!confirmed) return Promise.resolve();
                              return runAndReload(() => cancelEvent(event.id));
                            }}
                            disabled={event.status === 'scored'}
                          >
                            Mark Cancelled
                          </button>
                        </>
                      )}
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
