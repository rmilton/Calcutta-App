const express = require('express');
const {
  db,
  getActiveSeasonId,
  getStandings,
  getOwnership,
  getParticipantPortfolio,
  getTotalPotCents,
} = require('../db');
const { requireAuth } = require('./middleware');
const { buildDashboardPayload } = require('../services/dashboardService');
const { dashboardBriefingService } = require('../services/dashboardBriefingService');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const seasonId = getActiveSeasonId();
  res.json({
    standings: getStandings(seasonId),
    totalPotCents: getTotalPotCents(seasonId),
  });
});

router.get('/ownership', requireAuth, (req, res) => {
  res.json(getOwnership(getActiveSeasonId()));
});

router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const seasonId = getActiveSeasonId();
    const provider = req.app.get('resultsProvider');
    const payload = await buildDashboardPayload({
      seasonId,
      viewer: req.participant,
      provider,
    });
    payload.briefing = dashboardBriefingService.getSavedBriefing({
      seasonId,
      participantId: req.participant.id,
    });
    payload.briefingHistory = dashboardBriefingService.getBriefingHistory({
      seasonId,
      participantId: req.participant.id,
    });
    return res.json(payload);
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Dashboard data failed to load.' });
  }
});

router.post('/dashboard/briefing', requireAuth, async (req, res) => {
  try {
    const seasonId = getActiveSeasonId();
    const provider = req.app.get('resultsProvider');
    const dashboardPayload = await buildDashboardPayload({
      seasonId,
      viewer: req.participant,
      provider,
    });
    const briefing = await dashboardBriefingService.getBriefing({
      dashboardPayload,
      force: !!req.body?.force,
    });
    const briefingHistory = dashboardBriefingService.getBriefingHistory({
      seasonId,
      participantId: req.participant.id,
    });

    return res.json({
      briefing,
      briefingHistory,
      briefingMeta: {
        ...dashboardPayload.briefingMeta,
        snapshotHash: briefing.snapshotHash,
      },
    });
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Dashboard briefing failed to load.' });
  }
});

router.get('/participant/:id', requireAuth, (req, res) => {
  const seasonId = getActiveSeasonId();
  const participantId = parseInt(req.params.id, 10);

  const participant = db.prepare('SELECT id, name, color FROM participants WHERE id = ?').get(participantId);
  if (!participant) return res.status(404).json({ error: 'Participant not found' });

  const drivers = getParticipantPortfolio(seasonId, participantId);
  const totalSpentCents = drivers.reduce((sum, driver) => sum + driver.purchase_price_cents, 0);
  const totalEarnedCents = drivers.reduce(
    (sum, driver) => sum + driver.event_earnings_cents + driver.bonus_earnings_cents,
    0,
  );

  return res.json({
    participant,
    drivers,
    totalSpentCents,
    totalEarnedCents,
  });
});

module.exports = router;
