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
