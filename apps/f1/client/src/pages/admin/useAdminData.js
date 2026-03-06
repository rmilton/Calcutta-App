import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clearAllTestData as clearAllTestDataApi,
  loadHistoricalSeasonData as loadHistoricalSeasonDataApi,
  normalizeRulesPayload,
  normalizeSettingsPayload,
  patchSettings,
  readApi,
  readProviderStatus,
  recalcSeasonBonuses as recalcSeasonBonusesApi,
  resetAuctionOnly as resetAuctionOnlyApi,
  restoreSeeded2026Data as restoreSeeded2026DataApi,
  rescoreSeasonEvents as rescoreSeasonEventsApi,
  refreshDrivers as refreshDriversApi,
  refreshSchedule as refreshScheduleApi,
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
  const [providerStatus, setProviderStatus] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);

  const loadAll = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [settingsData, participantsData, eventsData, rulesData, providerStatusData] = await Promise.all([
        readApi('/admin/settings'),
        readApi('/admin/participants'),
        readApi('/events'),
        readApi('/admin/payout-rules'),
        readProviderStatus(),
      ]);
      setSettings(settingsData);
      setParticipants(Array.isArray(participantsData) ? participantsData : []);
      setEvents(Array.isArray(eventsData) ? eventsData : []);
      setRules(rulesData);
      setProviderStatus(providerStatusData);
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

  const saveSettingsPatch = useCallback(async (patch) => {
    try {
      await patchSettings(normalizeSettingsPayload({ ...(settings || {}), ...(patch || {}) }));
      setSettings((prev) => ({ ...(prev || {}), ...(patch || {}) }));
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

  const refreshDrivers = useCallback(async () => {
    try {
      const result = await refreshDriversApi();
      setMessage(result.message || 'Drivers refreshed.');
      await loadAll({ silent: true });
    } catch (error) {
      setMessage(error.message || 'Driver refresh failed.');
    }
  }, [loadAll]);

  const refreshSchedule = useCallback(async () => {
    try {
      const result = await refreshScheduleApi();
      setMessage(result.message || 'Schedule refreshed.');
      await loadAll({ silent: true });
    } catch (error) {
      setMessage(error.message || 'Schedule refresh failed.');
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

  const rescoreSeasonEvents = useCallback(async () => {
    try {
      const result = await rescoreSeasonEventsApi();
      setMessage(result.message || 'Scored events rescored.');
      await loadAll({ silent: true });
    } catch (error) {
      setMessage(error.message || 'Season rescore failed.');
    }
  }, [loadAll]);

  const clearAllTestData = useCallback(async () => {
    try {
      const result = await clearAllTestDataApi();
      setMessage(result.message || 'Test data cleared.');
      await loadAll({ silent: true });
    } catch (error) {
      setMessage(error.message || 'Failed to clear test data.');
    }
  }, [loadAll]);

  const resetAuctionOnly = useCallback(async () => {
    try {
      const result = await resetAuctionOnlyApi();
      setMessage(result.message || 'Auction reset.');
      await loadAll({ silent: true });
    } catch (error) {
      setMessage(error.message || 'Failed to reset auction.');
    }
  }, [loadAll]);

  const loadHistoricalSeasonData = useCallback(async (year) => {
    try {
      const result = await loadHistoricalSeasonDataApi(year);
      setMessage(result.message || `Loaded ${year} historical season data.`);
      await loadAll({ silent: true });
    } catch (error) {
      setMessage(error.message || 'Failed to load historical season data.');
    }
  }, [loadAll]);

  const restoreSeeded2026Data = useCallback(async () => {
    try {
      const result = await restoreSeeded2026DataApi();
      setMessage(result.message || 'Restored seeded 2026 data.');
      await loadAll({ silent: true });
    } catch (error) {
      setMessage(error.message || 'Failed to restore seeded 2026 data.');
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
    providerStatus,
    message,
    loading,
    hasLoaded,
    refresh: (options) => loadAll(options),
    setField,
    setMessage,
    saveSettings,
    saveSettingsPatch,
    runAuctionAction,
    refreshDrivers,
    refreshSchedule,
    clearAllTestData,
    resetAuctionOnly,
    loadHistoricalSeasonData,
    restoreSeeded2026Data,
    syncNext,
    syncEvent,
    recalcSeasonBonuses,
    rescoreSeasonEvents,
    updateRules,
    saveRules,
  }), [
    settings,
    participants,
    events,
    rules,
    providerStatus,
    message,
    loading,
    hasLoaded,
    loadAll,
    setField,
    saveSettings,
    saveSettingsPatch,
    runAuctionAction,
    refreshDrivers,
    refreshSchedule,
    clearAllTestData,
    resetAuctionOnly,
    loadHistoricalSeasonData,
    restoreSeeded2026Data,
    syncNext,
    syncEvent,
    recalcSeasonBonuses,
    rescoreSeasonEvents,
    updateRules,
    saveRules,
  ]);
}
