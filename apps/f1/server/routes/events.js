const express = require('express');
const {
  getActiveSeasonId,
  getEvents,
  getEventById,
  getEventResults,
  getEventPayouts,
  getTotalPotCents,
} = require('../db');
const { buildEventPayoutAudit } = require('../services/payoutAuditService');
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

  const payouts = getEventPayouts(seasonId, eventId);
  const totalPotCents = getTotalPotCents(seasonId);
  const eventPayoutCents = payouts.reduce((sum, payout) => sum + Number(payout.amount_cents || 0), 0);
  const payoutAudit = buildEventPayoutAudit({ seasonId, eventId });

  return res.json({
    event: {
      ...event,
      total_payout_cents: eventPayoutCents,
    },
    results: getEventResults(eventId),
    payouts,
    total_pot_cents: totalPotCents,
    event_payout_cents: eventPayoutCents,
    payout_audit: payoutAudit,
  });
});

module.exports = router;
