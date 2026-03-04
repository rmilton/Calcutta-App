import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { api } from '../utils';

const ADMIN_SECTIONS = [
  { path: 'overview', label: 'Overview', description: 'Season status and pool summary' },
  { path: 'auction', label: 'Auction', description: 'Controls and timing settings' },
  { path: 'results', label: 'Results Sync', description: 'Sync event outcomes and payouts' },
  { path: 'payouts', label: 'Payout Rules', description: 'Adjust basis-point distribution' },
];

async function readApi(path) {
  const response = await api(path);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function Admin() {
  const [settings, setSettings] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [events, setEvents] = useState([]);
  const [rules, setRules] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);

  const loadAll = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [s, p, e, r] = await Promise.all([
        readApi('/admin/settings'),
        readApi('/admin/participants'),
        readApi('/events'),
        readApi('/admin/payout-rules'),
      ]);
      setSettings(s);
      setParticipants(Array.isArray(p) ? p : []);
      setEvents(Array.isArray(e) ? e : []);
      setRules(r);
      setHasLoaded(true);
    } catch (error) {
      setMessage(error.message || 'Failed to load admin data.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const setField = useCallback((field, value) => {
    setSettings((prev) => ({ ...(prev || {}), [field]: value }));
  }, []);

  const saveSettings = useCallback(async () => {
    if (!settings) return;
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
      loadAll({ silent: true });
    } catch (error) {
      setMessage(error.message || 'Failed to save settings.');
    }
  }, [loadAll, settings]);

  const runAuctionAction = useCallback(async (endpoint) => {
    try {
      const response = await api(endpoint, { method: 'POST', body: '{}' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Action failed');
      setMessage('Auction action applied.');
      loadAll({ silent: true });
    } catch (error) {
      setMessage(error.message || 'Auction action failed.');
    }
  }, [loadAll]);

  const syncNext = useCallback(async () => {
    try {
      const response = await api('/admin/results/sync-next', { method: 'POST', body: '{}' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Sync failed');
      setMessage('Synced next event.');
      loadAll({ silent: true });
    } catch (error) {
      setMessage(error.message || 'Sync failed.');
    }
  }, [loadAll]);

  const syncEvent = useCallback(async (eventId) => {
    try {
      const response = await api(`/admin/results/sync-event/${eventId}`, { method: 'POST', body: '{}' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Sync failed');
      setMessage('Event synced.');
      loadAll({ silent: true });
    } catch (error) {
      setMessage(error.message || 'Event sync failed.');
    }
  }, [loadAll]);

  const updateRules = useCallback((group, id, field, value) => {
    setRules((prev) => {
      if (!prev?.[group]) return prev;
      return {
        ...prev,
        [group]: prev[group].map((rule) => (rule.id === id ? { ...rule, [field]: value } : rule)),
      };
    });
  }, []);

  const saveRules = useCallback(async () => {
    if (!rules) return;
    try {
      const payload = {
        grand_prix: (rules.grand_prix || []).map((r) => ({ ...r, bps: Number(r.bps) || 0 })),
        sprint: (rules.sprint || []).map((r) => ({ ...r, bps: Number(r.bps) || 0 })),
        season_bonus: (rules.season_bonus || []).map((r) => ({ ...r, bps: Number(r.bps) || 0 })),
      };
      const response = await api('/admin/payout-rules', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save rules');
      setMessage('Payout rules saved and standings recalculated.');
      loadAll({ silent: true });
    } catch (error) {
      setMessage(error.message || 'Failed to save payout rules.');
    }
  }, [loadAll, rules]);

  const contextValue = useMemo(() => ({
    settings,
    participants,
    events,
    rules,
    message,
    loading,
    hasLoaded,
    refresh: () => loadAll(),
    setField,
    setMessage,
    saveSettings,
    runAuctionAction,
    syncNext,
    syncEvent,
    updateRules,
    saveRules,
  }), [
    settings,
    participants,
    events,
    rules,
    message,
    loading,
    hasLoaded,
    loadAll,
    setField,
    saveSettings,
    runAuctionAction,
    syncNext,
    syncEvent,
    updateRules,
    saveRules,
  ]);

  return (
    <div className="stack-lg">
      <section className="panel panel-hero admin-header">
        <div className="hero-kicker">Race Control</div>
        <h1>Admin Console</h1>
        <p>Use sectioned controls to run the auction, sync races, and tune payout models.</p>
      </section>

      {message ? <section className="panel note-panel">{message}</section> : null}

      <div className="admin-layout">
        <aside className="panel admin-sidebar">
          <nav className="admin-secondary-nav" aria-label="Admin sections">
            {ADMIN_SECTIONS.map((section) => (
              <NavLink
                key={section.path}
                to={section.path}
                className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
              >
                <span className="admin-nav-label">{section.label}</span>
                <span className="admin-nav-desc">{section.description}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <section className="admin-main stack-lg">
          <nav className="admin-secondary-nav-mobile" aria-label="Admin sections">
            {ADMIN_SECTIONS.map((section) => (
              <NavLink
                key={section.path}
                to={section.path}
                className={({ isActive }) => `admin-nav-pill ${isActive ? 'active' : ''}`}
              >
                {section.label}
              </NavLink>
            ))}
          </nav>
          <Outlet context={contextValue} />
        </section>
      </div>
    </div>
  );
}
