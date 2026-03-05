import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  normalizeRulesPayload,
  normalizeSettingsPayload,
  patchSettings,
  readApi,
  recalcSeasonBonuses as recalcSeasonBonusesApi,
  runAuctionAction as runAuctionActionApi,
  savePayoutRules,
  syncEvent as syncEventApi,
  syncNext as syncNextApi,
} from './adminApi';

export default function useAdminData() {
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
      const [settingsData, participantsData, eventsData, rulesData] = await Promise.all([
        readApi('/admin/settings'),
        readApi('/admin/participants'),
        readApi('/events'),
        readApi('/admin/payout-rules'),
      ]);
      setSettings(settingsData);
      setParticipants(Array.isArray(participantsData) ? participantsData : []);
      setEvents(Array.isArray(eventsData) ? eventsData : []);
      setRules(rulesData);
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
      await patchSettings(normalizeSettingsPayload(settings));
      setMessage('Settings saved.');
      await loadAll({ silent: true });
    } catch (error) {
      setMessage(error.message || 'Failed to save settings.');
    }
  }, [loadAll, settings]);

  const runAuctionAction = useCallback(async (endpoint) => {
    try {
      await runAuctionActionApi(endpoint);
      setMessage('Auction action applied.');
      await loadAll({ silent: true });
    } catch (error) {
      setMessage(error.message || 'Auction action failed.');
    }
  }, [loadAll]);

  const syncNext = useCallback(async ({ force = false } = {}) => {
    try {
      await syncNextApi({ force });
      setMessage(force ? 'Advanced and synced next event.' : 'Synced next event.');
      await loadAll({ silent: true });
    } catch (error) {
      setMessage(error.message || 'Sync failed.');
    }
  }, [loadAll]);

  const syncEvent = useCallback(async (eventId, { force = false } = {}) => {
    try {
      await syncEventApi(eventId, { force });
      setMessage(force ? 'Event force-synced.' : 'Event synced.');
      await loadAll({ silent: true });
    } catch (error) {
      setMessage(error.message || 'Event sync failed.');
    }
  }, [loadAll]);

  const recalcSeasonBonuses = useCallback(async () => {
    try {
      await recalcSeasonBonusesApi();
      setMessage('Season bonuses recalculated.');
      await loadAll({ silent: true });
    } catch (error) {
      setMessage(error.message || 'Recalculation failed.');
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
      await savePayoutRules(normalizeRulesPayload(rules));
      setMessage('Payout rules saved and standings recalculated.');
      await loadAll({ silent: true });
    } catch (error) {
      setMessage(error.message || 'Failed to save payout rules.');
    }
  }, [loadAll, rules]);

  return useMemo(() => ({
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
    recalcSeasonBonuses,
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
    recalcSeasonBonuses,
    updateRules,
    saveRules,
  ]);
}
