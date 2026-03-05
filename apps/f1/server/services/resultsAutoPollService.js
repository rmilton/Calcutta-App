const { getActiveSeasonId, upsertProviderSyncState } = require('../db');
const resultsAdminService = require('./admin/resultsAdminService');

function createResultsAutoPollService({ provider, io }) {
  const enabled = String(process.env.F1_AUTO_POLL_ENABLED || '0') === '1';
  const intervalSeconds = Math.max(30, Number(process.env.F1_AUTO_POLL_INTERVAL_SECONDS) || 120);
  let timer = null;
  let running = false;
  let lastRunAt = null;

  async function tick() {
    if (!enabled || running) return;
    running = true;
    lastRunAt = Date.now();

    const seasonId = getActiveSeasonId();
    const providerName = provider?.name || 'unknown';

    try {
      if (providerName !== 'openf1') {
        upsertProviderSyncState(seasonId, 'auto_poll', {
          provider: providerName,
          status: 'disabled',
          message: `Auto-poll requires openf1; current provider is ${providerName}.`,
          meta: { enabled, intervalSeconds, lastRunAt },
        });
        return;
      }

      const result = await resultsAdminService.syncNextResults({
        seasonId,
        provider,
        io,
        force: false,
      });

      if (result.ok) {
        upsertProviderSyncState(seasonId, 'auto_poll', {
          provider: providerName,
          status: 'success',
          message: 'Auto-poll synced the next available event.',
          meta: { enabled, intervalSeconds, lastRunAt, rowCount: result.rowCount || 0 },
        });
        return;
      }

      if (result.status === 404) {
        upsertProviderSyncState(seasonId, 'auto_poll', {
          provider: providerName,
          status: 'idle',
          message: 'No due events are pending sync.',
          meta: { enabled, intervalSeconds, lastRunAt },
        });
        return;
      }

      upsertProviderSyncState(seasonId, 'auto_poll', {
        provider: providerName,
        status: 'error',
        message: result.error || 'Auto-poll failed.',
        meta: { enabled, intervalSeconds, lastRunAt },
      });
    } catch (error) {
      upsertProviderSyncState(seasonId, 'auto_poll', {
        provider: providerName,
        status: 'error',
        message: error.message || 'Auto-poll failed.',
        meta: { enabled, intervalSeconds, lastRunAt },
      });
    } finally {
      running = false;
    }
  }

  function start() {
    if (!enabled || timer) return;
    timer = setInterval(() => {
      tick().catch(() => {});
    }, intervalSeconds * 1000);
    timer.unref?.();
    tick().catch(() => {});
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  function getStatus() {
    return {
      enabled,
      intervalSeconds,
      running,
      lastRunAt,
    };
  }

  return {
    start,
    stop,
    getStatus,
  };
}

module.exports = {
  createResultsAutoPollService,
};
