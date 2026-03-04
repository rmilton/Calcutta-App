import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, categoryLabel, fmtCents } from '../utils';

export default function Admin() {
  const [settings, setSettings] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [events, setEvents] = useState([]);
  const [rules, setRules] = useState(null);
  const [message, setMessage] = useState('');

  const loadAll = useCallback(async () => {
    const [s, p, e, r] = await Promise.all([
      api('/admin/settings').then((res) => res.json()),
      api('/admin/participants').then((res) => res.json()),
      api('/events').then((res) => res.json()),
      api('/admin/payout-rules').then((res) => res.json()),
    ]);
    setSettings(s);
    setParticipants(p);
    setEvents(e);
    setRules(r);
  }, []);

  useEffect(() => {
    loadAll().catch((e) => setMessage(e.message));
  }, [loadAll]);

  const setField = (field, value) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const saveSettings = async () => {
    try {
      const response = await api('/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          auction_timer_seconds: Number(settings.auction_timer_seconds) || 30,
          auction_grace_seconds: Number(settings.auction_grace_seconds) || 15,
          auction_auto_advance: settings.auction_auto_advance ? 1 : 0,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save settings');
      setMessage('Settings saved.');
      loadAll().catch(() => {});
    } catch (error) {
      setMessage(error.message || 'Failed to save settings.');
    }
  };

  const runAuctionAction = async (endpoint) => {
    try {
      const response = await api(endpoint, { method: 'POST', body: '{}' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Action failed');
      setMessage('Auction action applied.');
      loadAll().catch(() => {});
    } catch (error) {
      setMessage(error.message || 'Auction action failed.');
    }
  };

  const syncNext = async () => {
    try {
      const response = await api('/admin/results/sync-next', { method: 'POST', body: '{}' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Sync failed');
      setMessage('Synced next event.');
      loadAll().catch(() => {});
    } catch (error) {
      setMessage(error.message || 'Sync failed.');
    }
  };

  const syncEvent = async (eventId) => {
    try {
      const response = await api(`/admin/results/sync-event/${eventId}`, { method: 'POST', body: '{}' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Sync failed');
      setMessage('Event synced.');
      loadAll().catch(() => {});
    } catch (error) {
      setMessage(error.message || 'Event sync failed.');
    }
  };

  const updateRules = (group, id, field, value) => {
    setRules((prev) => ({
      ...prev,
      [group]: prev[group].map((rule) => (rule.id === id ? { ...rule, [field]: value } : rule)),
    }));
  };

  const saveRules = async () => {
    try {
      const payload = {
        grand_prix: rules.grand_prix.map((r) => ({ ...r, bps: Number(r.bps) || 0 })),
        sprint: rules.sprint.map((r) => ({ ...r, bps: Number(r.bps) || 0 })),
        season_bonus: rules.season_bonus.map((r) => ({ ...r, bps: Number(r.bps) || 0 })),
      };

      const response = await api('/admin/payout-rules', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save rules');
      setMessage('Payout rules saved and standings recalculated.');
      loadAll().catch(() => {});
    } catch (error) {
      setMessage(error.message || 'Failed to save payout rules.');
    }
  };

  const gpTotal = useMemo(() => (rules?.grand_prix || []).reduce((sum, rule) => sum + Number(rule.bps || 0), 0), [rules]);
  const sprintTotal = useMemo(() => (rules?.sprint || []).reduce((sum, rule) => sum + Number(rule.bps || 0), 0), [rules]);
  const bonusTotal = useMemo(() => (rules?.season_bonus || []).reduce((sum, rule) => sum + Number(rule.bps || 0), 0), [rules]);

  return (
    <div className="stack-lg">
      <section className="panel telemetry-strip">
        <div className="strip-item">
          <span className="label">Invite Code</span>
          <strong>{settings?.invite_code}</strong>
        </div>
        <div className="strip-item">
          <span className="label">Auction Status</span>
          <strong className={`status-text status-${settings?.auction_status}`}>{settings?.auction_status}</strong>
        </div>
        <div className="strip-item">
          <span className="label">Participants</span>
          <strong>{participants.length}</strong>
        </div>
      </section>

      {message ? <section className="panel note-panel">{message}</section> : null}

      <section className="panel stack">
        <h2>Auction Controls</h2>
        <div className="row wrap gap-sm">
          <button className="btn" onClick={() => runAuctionAction('/admin/auction/start')}>Open</button>
          <button className="btn btn-outline" onClick={() => runAuctionAction('/admin/auction/pause')}>Pause</button>
          <button className="btn btn-outline" onClick={() => runAuctionAction('/admin/auction/next')}>Start Next Driver</button>
          <button className="btn btn-outline" onClick={() => runAuctionAction('/admin/auction/close')}>Close Active</button>
        </div>
      </section>

      <section className="panel stack">
        <h2>Auction Settings</h2>
        <div className="grid-3">
          <label>
            Timer (sec)
            <input
              value={settings?.auction_timer_seconds ?? ''}
              onChange={(e) => setField('auction_timer_seconds', e.target.value)}
            />
          </label>
          <label>
            Grace (sec)
            <input
              value={settings?.auction_grace_seconds ?? ''}
              onChange={(e) => setField('auction_grace_seconds', e.target.value)}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={String(settings?.auction_auto_advance) === '1' || settings?.auction_auto_advance === 1 || settings?.auction_auto_advance === true}
              onChange={(e) => setField('auction_auto_advance', e.target.checked ? 1 : 0)}
            />
            Auto Advance
          </label>
        </div>
        <button className="btn" onClick={saveSettings}>Save Settings</button>
      </section>

      <section className="panel stack">
        <div className="row between">
          <h2>Results Sync</h2>
          <button className="btn" onClick={syncNext}>Sync Next Event</button>
        </div>
        <ul className="list">
          {events.map((event) => (
            <li key={event.id}>
              <div>
                <strong>R{event.round_number}</strong> {event.name}
                <div className="muted small">{event.type} • {event.status} • payout {fmtCents(event.total_payout_cents || 0)}</div>
              </div>
              <button className="btn btn-outline" onClick={() => syncEvent(event.id)}>Sync</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel stack">
        <h2>Payout Rules</h2>
        <p className="muted">1% = 100 bps. GP target 300 bps, Sprint target 100 bps, Season bonus target 10,000 bps.</p>

        {rules ? (
          <>
            <h3>Grand Prix ({gpTotal} bps)</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Category</th><th>BPS</th></tr></thead>
                <tbody>
                  {rules.grand_prix.map((rule) => (
                    <tr key={rule.id}>
                      <td>{categoryLabel(rule.category)}</td>
                      <td>
                        <input
                          value={rule.bps}
                          onChange={(e) => updateRules('grand_prix', rule.id, 'bps', e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3>Sprint ({sprintTotal} bps)</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Category</th><th>BPS</th></tr></thead>
                <tbody>
                  {rules.sprint.map((rule) => (
                    <tr key={rule.id}>
                      <td>{categoryLabel(rule.category)}</td>
                      <td>
                        <input
                          value={rule.bps}
                          onChange={(e) => updateRules('sprint', rule.id, 'bps', e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3>Season Bonuses ({bonusTotal} bps)</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Category</th><th>BPS</th></tr></thead>
                <tbody>
                  {rules.season_bonus.map((rule) => (
                    <tr key={rule.id}>
                      <td>{categoryLabel(rule.category)}</td>
                      <td>
                        <input
                          value={rule.bps}
                          onChange={(e) => updateRules('season_bonus', rule.id, 'bps', e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn" onClick={saveRules}>Save Rules</button>
          </>
        ) : null}
      </section>
    </div>
  );
}
