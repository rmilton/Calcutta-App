const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { db, getActiveSeasonId } = require('../db');
const { requireAuth, requireAdmin } = require('./middleware');

const auctionAdminService = require('../services/admin/auctionAdminService');
const payoutRulesAdminService = require('../services/admin/payoutRulesAdminService');
const resultsAdminService = require('../services/admin/resultsAdminService');
const { OpenF1ResultsProvider } = require('../providers/openF1ResultsProvider');
const {
  parseForceFlag,
  parseIntegerParam,
  runAndRespond,
} = require('../services/admin/common');

const router = express.Router();

function withAdmin(req, res, next) {
  return requireAuth(req, res, () => requireAdmin(req, res, next));
}

function parseIdFromParams(res, rawId) {
  const id = parseIntegerParam(rawId);
  if (id == null) {
    res.status(400).json({ error: 'Invalid numeric id' });
    return null;
  }
  return id;
}

router.get('/settings', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  return res.json(auctionAdminService.getSettings({ seasonId }));
});

router.patch('/settings', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const io = req.app.get('io');
  const result = auctionAdminService.updateSettingsForSeason({
    seasonId,
    patch: req.body,
    io,
  });
  return runAndRespond(res, result);
});

router.post('/invite-code/regenerate', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  return runAndRespond(res, auctionAdminService.regenerateInviteCode({ seasonId }));
});

router.get('/participants', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  return res.json(auctionAdminService.listParticipants({ seasonId }));
});

router.delete('/participants/:id', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const participantId = parseIdFromParams(res, req.params.id);
  if (participantId == null) return undefined;
  return runAndRespond(res, auctionAdminService.removeParticipant({ seasonId, participantId }));
});

router.get('/auction/queue', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  return res.json(auctionAdminService.listAuctionQueue({ seasonId }));
});

router.patch('/auction/queue', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  return runAndRespond(res, auctionAdminService.updateAuctionQueue({ seasonId, order: req.body?.order }));
});

router.post('/auction/start', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const io = req.app.get('io');
  return runAndRespond(res, auctionAdminService.setAuctionStatus({ seasonId, status: 'open', io }));
});

router.post('/auction/pause', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const io = req.app.get('io');
  return runAndRespond(res, auctionAdminService.setAuctionStatus({ seasonId, status: 'paused', io }));
});

router.post('/auction/next', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const auctionService = req.app.get('auctionService');
  const result = auctionAdminService.startNextAuction({
    seasonId,
    auctionService,
    driverId: req.body?.driverId,
  });
  return runAndRespond(res, result, (payload) => ({ ok: true, ...payload }));
});

router.post('/auction/close', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const auctionService = req.app.get('auctionService');
  const result = auctionAdminService.closeActiveAuction({ seasonId, auctionService });
  return runAndRespond(res, result, () => ({ ok: true }));
});

router.post('/auction/shuffle', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const result = auctionAdminService.shufflePendingAuctionQueue({ seasonId });
  return runAndRespond(res, result, (payload) => ({ ok: true, ...payload }));
});

router.get('/payout-rules', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  return res.json(payoutRulesAdminService.getPayoutRulesForSeason({ seasonId }));
});

router.patch('/payout-rules', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const io = req.app.get('io');
  const result = payoutRulesAdminService.savePayoutRulesForSeason({
    seasonId,
    payload: req.body,
    io,
  });
  return runAndRespond(res, result);
});

router.post('/results/sync-next', withAdmin, async (req, res) => {
  const seasonId = getActiveSeasonId();
  const provider = req.app.get('resultsProvider');
  const result = await resultsAdminService.syncNextResults({
    seasonId,
    provider,
    io: req.app.get('io'),
    force: parseForceFlag(req),
  });
  return runAndRespond(res, result, (payload) => ({ ok: true, ...payload }));
});

router.get('/results/provider-status', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const provider = req.app.get('resultsProvider');
  const autoPollService = req.app.get('resultsAutoPollService');
  return res.json(resultsAdminService.getProviderStatus({
    seasonId,
    provider,
    autoPollService,
  }));
});

router.get('/ops/database-backup', withAdmin, async (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(os.tmpdir(), `f1-calcutta-backup-${timestamp}.db`);
  const downloadName = `f1-calcutta-backup-${timestamp}.db`;

  try {
    await db.backup(backupPath);
    return res.download(backupPath, downloadName, (error) => {
      fs.unlink(backupPath, () => {});
      if (error && !res.headersSent) {
        res.status(500).json({ error: 'Failed to stream database backup.' });
      }
    });
  } catch (error) {
    fs.unlink(backupPath, () => {});
    return res.status(500).json({ error: error.message || 'Failed to create database backup.' });
  }
});

router.post('/test-data/clear-all', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const result = resultsAdminService.clearTestDataForSeason({
    seasonId,
    io: req.app.get('io'),
    auctionService: req.app.get('auctionService'),
  });
  return runAndRespond(res, result, (payload) => ({ ok: true, ...payload }));
});

router.post('/test-data/reset-auction', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const result = resultsAdminService.resetAuctionOnlyForSeason({
    seasonId,
    io: req.app.get('io'),
    auctionService: req.app.get('auctionService'),
  });
  return runAndRespond(res, result, (payload) => ({ ok: true, ...payload }));
});

router.post('/test-data/load-openf1-year', withAdmin, async (req, res) => {
  const seasonId = getActiveSeasonId();
  const provider = new OpenF1ResultsProvider({ baseUrl: process.env.OPENF1_BASE_URL });
  const result = await resultsAdminService.loadHistoricalSeasonMetadata({
    seasonId,
    provider,
    year: req.body?.year,
    io: req.app.get('io'),
    auctionService: req.app.get('auctionService'),
  });
  return runAndRespond(res, result, (payload) => ({ ok: true, ...payload }));
});

router.post('/test-data/restore-seeded-2026', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const result = resultsAdminService.restoreSeededSeasonMetadata({
    seasonId,
    io: req.app.get('io'),
    auctionService: req.app.get('auctionService'),
  });
  return runAndRespond(res, result, (payload) => ({ ok: true, ...payload }));
});

router.post('/results/refresh-drivers', withAdmin, async (req, res) => {
  const seasonId = getActiveSeasonId();
  const provider = req.app.get('resultsProvider');
  const result = await resultsAdminService.refreshDriversFromProvider({ seasonId, provider });
  return runAndRespond(res, result, (payload) => ({ ok: true, ...payload }));
});

router.post('/results/refresh-schedule', withAdmin, async (req, res) => {
  const seasonId = getActiveSeasonId();
  const provider = req.app.get('resultsProvider');
  const result = await resultsAdminService.refreshScheduleFromProvider({ seasonId, provider });
  return runAndRespond(res, result, (payload) => ({ ok: true, ...payload }));
});

router.post('/results/advance-next', withAdmin, async (req, res) => {
  const seasonId = getActiveSeasonId();
  const provider = req.app.get('resultsProvider');
  const result = await resultsAdminService.syncNextResults({
    seasonId,
    provider,
    io: req.app.get('io'),
    force: true,
  });
  return runAndRespond(res, result, (payload) => ({ ok: true, ...payload }));
});

router.post('/results/sync-event/:id', withAdmin, async (req, res) => {
  const seasonId = getActiveSeasonId();
  const eventId = parseIdFromParams(res, req.params.id);
  if (eventId == null) return undefined;

  const provider = req.app.get('resultsProvider');
  const result = await resultsAdminService.syncEventResults({
    seasonId,
    eventId,
    provider,
    io: req.app.get('io'),
    force: parseForceFlag(req),
  });
  return runAndRespond(res, result, (payload) => ({ ok: true, ...payload }));
});

router.get('/results/event/:id', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const eventId = parseIdFromParams(res, req.params.id);
  if (eventId == null) return undefined;

  const result = resultsAdminService.getEventEditorData({ seasonId, eventId });
  return runAndRespond(res, result, (payload) => ({
    event: payload.event,
    drivers: payload.drivers,
    results: payload.results,
  }));
});

router.patch('/results/event/:id', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const eventId = parseIdFromParams(res, req.params.id);
  if (eventId == null) return undefined;

  const result = resultsAdminService.saveManualResultsAndScore({
    seasonId,
    eventId,
    rows: req.body?.results,
    force: parseForceFlag(req),
  });

  if (!result.ok) {
    return res.status(result.status || 400).json({ error: result.error });
  }

  req.app.get('io')?.emit('event:scored', { eventId });
  req.app.get('io')?.emit('standings:update');

  return res.json({ ok: true, rowCount: result.rowCount });
});

router.post('/results/recalc-season-bonuses', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const result = resultsAdminService.recalcSeasonBonusesForSeason({
    seasonId,
    io: req.app.get('io'),
  });
  return runAndRespond(res, result, (payload) => ({ ok: true, ...payload }));
});

router.post('/results/rescore-season-events', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const result = resultsAdminService.rescoreSeasonEventsForSeason({
    seasonId,
    io: req.app.get('io'),
  });
  return runAndRespond(res, result, (payload) => ({ ok: true, ...payload }));
});

router.get('/results/season-bonus-payouts', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  return res.json(resultsAdminService.getSeasonBonusPayouts({ seasonId }));
});

module.exports = router;
