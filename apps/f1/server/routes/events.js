const express = require('express');
const {
  getActiveSeasonId,
  getEvents,
  getEventById,
  getEventResults,
  getEventPayouts,
} = require('../db');
const { requireAuth } = require('./middleware');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const seasonId = getActiveSeasonId();
  res.json(getEvents(seasonId));
});

router.get('/:id/payouts', requireAuth, (req, res) => {
  const seasonId = getActiveSeasonId();
  const eventId = parseInt(req.params.id, 10);

  const event = getEventById(seasonId, eventId);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  return res.json({
    event,
    results: getEventResults(eventId),
    payouts: getEventPayouts(seasonId, eventId),
  });
});

module.exports = router;
