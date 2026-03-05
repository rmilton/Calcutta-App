import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  categoryLabel,
  eventTypeLabel,
  fmtCents,
} from '../../utils';
import { getTeamColorStyle } from '../../teamMeta';
import useAdminOutletContext from './useAdminOutletContext';

function parsePositiveInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

function buildManualRows(drivers, results) {
  const byDriver = new Map((results || []).map((row) => [row.driver_id, row]));
  return (drivers || []).map((driver) => {
    const existing = byDriver.get(driver.id);
    return {
      driver_id: driver.id,
      driver_code: driver.code,
      driver_name: driver.name,
      team_name: driver.team_name,
      finish_position: existing?.finish_position ?? '',
      start_position: existing?.start_position ?? '',
    };
  });
}

export default function ResultsPage() {
  const {
    events,
    syncNext,
    syncEvent,
    recalcSeasonBonuses,
    refresh,
    setMessage,
    loading,
    hasLoaded,
  } = useAdminOutletContext();
  const [selectedEventId, setSelectedEventId] = useState('');
  const [manualRows, setManualRows] = useState([]);
  const [manualMeta, setManualMeta] = useState(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [bonusRows, setBonusRows] = useState([]);
  const [bonusTotals, setBonusTotals] = useState([]);
  const [bonusLoading, setBonusLoading] = useState(false);

  useEffect(() => {
    if (!selectedEventId && events?.length) {
      setSelectedEventId(String(events[0].id));
    }
  }, [events, selectedEventId]);

  const loadManualEvent = useCallback(async (eventId) => {
    if (!eventId) {
      setManualRows([]);
      setManualMeta(null);
      return;
    }

    setEditorLoading(true);
    try {
      const response = await api(`/admin/results/event/${eventId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load event');
      setManualMeta(data.event || null);
      setManualRows(buildManualRows(data.drivers, data.results));
    } catch (error) {
      setMessage(error.message || 'Failed to load manual result editor.');
      setManualRows([]);
      setManualMeta(null);
    } finally {
      setEditorLoading(false);
    }
  }, [setMessage]);

  const loadSeasonBonusBreakdown = useCallback(async () => {
    setBonusLoading(true);
    try {
      const response = await api('/admin/results/season-bonus-payouts');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load season bonus payouts');
      setBonusRows(Array.isArray(data.rows) ? data.rows : []);
      setBonusTotals(Array.isArray(data.totals) ? data.totals : []);
    } catch (error) {
      setMessage(error.message || 'Failed to load season bonus payouts.');
      setBonusRows([]);
      setBonusTotals([]);
    } finally {
      setBonusLoading(false);
    }
  }, [setMessage]);

  useEffect(() => {
    if (!selectedEventId) return;
    loadManualEvent(selectedEventId);
  }, [selectedEventId, loadManualEvent]);

  useEffect(() => {
    loadSeasonBonusBreakdown();
  }, [loadSeasonBonusBreakdown]);

  const finishValues = useMemo(
    () => manualRows
      .map((row) => parsePositiveInt(row.finish_position))
      .filter((value) => value != null),
    [manualRows]
  );
  const hasDuplicateFinish = useMemo(
    () => new Set(finishValues).size !== finishValues.length,
    [finishValues]
  );

  const onManualCellChange = useCallback((driverId, field, value) => {
    setManualRows((prev) => prev.map((row) => (
      row.driver_id === driverId ? { ...row, [field]: value } : row
    )));
  }, []);

  const runAndReload = useCallback(async (runner) => {
    await runner();
    await refresh();
    await loadSeasonBonusBreakdown();
    if (selectedEventId) await loadManualEvent(selectedEventId);
  }, [refresh, loadSeasonBonusBreakdown, loadManualEvent, selectedEventId]);

  const saveManualResults = useCallback(async () => {
    if (!selectedEventId) return;

    const payloadRows = manualRows
      .map((row) => {
        const finish_position = parsePositiveInt(row.finish_position);
        if (finish_position == null) return null;
        const start_position = parsePositiveInt(row.start_position);
        return {
          driver_id: row.driver_id,
          finish_position,
          start_position,
        };
      })
      .filter(Boolean);

    if (!payloadRows.length) {
      setMessage('Enter at least one finishing position before saving manual results.');
      return;
    }

    const finishSet = new Set(payloadRows.map((row) => row.finish_position));
    if (finishSet.size !== payloadRows.length) {
      setMessage('Manual results contain duplicate finishing positions. Resolve duplicates first.');
      return;
    }

    setEditorSaving(true);
    try {
      const response = await api(`/admin/results/event/${selectedEventId}`, {
        method: 'PATCH',
        body: JSON.stringify({ results: payloadRows, force: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save manual results');

      setMessage('Manual results saved and event scored.');
      await refresh();
      await loadSeasonBonusBreakdown();
      await loadManualEvent(selectedEventId);
    } catch (error) {
      setMessage(error.message || 'Failed to save manual results.');
    } finally {
      setEditorSaving(false);
    }
  }, [selectedEventId, manualRows, setMessage, refresh, loadSeasonBonusBreakdown, loadManualEvent]);

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

      <section className="panel stack">
        <div className="row between wrap gap-sm">
          <h2>Manual Results Editor</h2>
          <div className="row wrap gap-sm">
            <label>
              Event
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
              >
                <option value="">Select event</option>
                {(events || []).map((event) => (
                  <option key={event.id} value={event.id}>
                    R{event.round_number} {event.name} ({eventTypeLabel(event.type)})
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn"
              onClick={saveManualResults}
              disabled={editorSaving || editorLoading || !selectedEventId}
            >
              {editorSaving ? 'Saving...' : 'Save Manual + Score'}
            </button>
          </div>
        </div>
        {manualMeta ? (
          <p className="muted small">
            Editing {manualMeta.name} ({eventTypeLabel(manualMeta.type)}). Save uses forced scoring for testing progression.
          </p>
        ) : null}
        {hasDuplicateFinish ? <p className="error-text">Duplicate finishing positions detected.</p> : null}
        {editorLoading ? <p className="muted">Loading event data...</p> : null}
        {!editorLoading && selectedEventId && manualRows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Finish</th>
                  <th>Start</th>
                  <th>Gain</th>
                </tr>
              </thead>
              <tbody>
                {manualRows.map((row) => {
                  const finish = parsePositiveInt(row.finish_position);
                  const start = parsePositiveInt(row.start_position);
                  const gain = finish != null && start != null ? (start - finish) : null;
                  return (
                    <tr key={row.driver_id}>
                      <td>
                        <span
                          className="team-accent-text"
                          style={getTeamColorStyle({ teamName: row.team_name, driverCode: row.driver_code })}
                        >
                          {row.driver_code} - {row.driver_name}
                        </span>
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          value={row.finish_position}
                          onChange={(e) => onManualCellChange(row.driver_id, 'finish_position', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          value={row.start_position}
                          onChange={(e) => onManualCellChange(row.driver_id, 'start_position', e.target.value)}
                        />
                      </td>
                      <td>{gain == null ? '—' : gain}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="panel stack">
        <div className="row between wrap gap-sm">
          <h2>Season Bonus Payouts</h2>
          <button
            className="btn btn-outline"
            onClick={async () => {
              await recalcSeasonBonuses();
              await loadSeasonBonusBreakdown();
            }}
          >
            Recalculate Season Bonuses
          </button>
        </div>
        {bonusLoading ? <p className="muted">Loading season bonus payouts...</p> : null}
        {!bonusLoading && bonusTotals.length ? (
          <ul className="chip-list">
            {bonusTotals.map((item) => (
              <li key={item.category}>
                {categoryLabel(item.category)}: {fmtCents(item.total_cents)}
              </li>
            ))}
          </ul>
        ) : null}
        {!bonusLoading && bonusRows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Participant</th>
                  <th>Driver</th>
                  <th>Amount</th>
                  <th>Tie</th>
                </tr>
              </thead>
              <tbody>
                {bonusRows.map((row) => (
                  <tr key={row.id}>
                    <td>{categoryLabel(row.category)}</td>
                    <td>{row.participant_name}</td>
                    <td>
                      {row.driver_code ? (
                        <span
                          className="team-accent-text"
                          style={getTeamColorStyle({ driverCode: row.driver_code })}
                        >
                          {row.driver_code} - {row.driver_name}
                        </span>
                      ) : '—'}
                    </td>
                    <td>{fmtCents(row.amount_cents)}</td>
                    <td>{row.tie_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {!bonusLoading && !bonusRows.length ? <p className="muted small">No season bonus payouts yet.</p> : null}
      </section>
    </div>
  );
}
