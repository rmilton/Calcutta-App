const express = require('express');

const { generateInviteCode } = require('../lib/core');
const {
  db,
  getActiveSeasonId,
  getSeasonSettings,
  updateSeasonSettings,
  getSeasonParticipants,
  getAuctionItems,
  getDrivers,
  getEventById,
  getEventResults,
  getEventPayoutRules,
  getSeasonBonusRules,
} = require('../db');
const {
  scoreEvent,
  recalcSeasonBonuses,
  upsertEventResults,
  syncEventFromProvider,
  syncNextEventFromProvider,
} = require('../services/scoringService');
const { requireAuth, requireAdmin } = require('./middleware');

const router = express.Router();

function withAdmin(req, res, next) {
  return requireAuth(req, res, () => requireAdmin(req, res, next));
}

router.get('/settings', withAdmin, (req, res) => {
  res.json(getSeasonSettings(getActiveSeasonId()));
});

router.patch('/settings', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  updateSeasonSettings(seasonId, req.body || {});
  const settings = getSeasonSettings(seasonId);
  req.app.get('io')?.emit('auction:status', { status: settings.auction_status });
  return res.json({ ok: true, settings });
});

router.post('/invite-code/regenerate', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const code = generateInviteCode();
  updateSeasonSettings(seasonId, { invite_code: code });
  res.json({ ok: true, invite_code: code });
});

router.get('/participants', withAdmin, (req, res) => {
  res.json(getSeasonParticipants(getActiveSeasonId()));
});

router.delete('/participants/:id', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const participantId = parseInt(req.params.id, 10);
  db.prepare(`
    DELETE FROM season_participants
    WHERE season_id = ?
      AND participant_id = ?
      AND participant_id IN (SELECT id FROM participants WHERE is_admin = 0)
  `).run(seasonId, participantId);
  res.json({ ok: true });
});

router.get('/auction/queue', withAdmin, (req, res) => {
  res.json(getAuctionItems(getActiveSeasonId()));
});

router.patch('/auction/queue', withAdmin, (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });

  const update = db.prepare(`
    UPDATE auction_items
    SET queue_order = ?
    WHERE id = ? AND status = 'pending' AND season_id = ?
  `);

  const seasonId = getActiveSeasonId();
  db.transaction(() => {
    order.forEach((item) => update.run(item.queue_order, item.id, seasonId));
  })();

  return res.json({ ok: true });
});

router.post('/auction/start', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  updateSeasonSettings(seasonId, { auction_status: 'open' });
  req.app.get('io')?.emit('auction:status', { status: 'open' });
  res.json({ ok: true });
});

router.post('/auction/pause', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  updateSeasonSettings(seasonId, { auction_status: 'paused' });
  req.app.get('io')?.emit('auction:status', { status: 'paused' });
  res.json({ ok: true });
});

router.post('/auction/next', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const auctionService = req.app.get('auctionService');
  const result = auctionService.startAuction({ seasonId, driverId: req.body?.driverId });
  if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
  return res.json({ ok: true, ...result });
});

router.post('/auction/close', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const auctionService = req.app.get('auctionService');
  const result = auctionService.closeActiveAuction({ seasonId });
  if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
  return res.json({ ok: true });
});

router.get('/payout-rules', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  return res.json({
    grand_prix: getEventPayoutRules(seasonId, 'grand_prix'),
    sprint: getEventPayoutRules(seasonId, 'sprint'),
    season_bonus: getSeasonBonusRules(seasonId),
  });
});

router.patch('/payout-rules', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const { grand_prix, sprint, season_bonus } = req.body || {};

  const updateEventRule = db.prepare(`
    UPDATE event_payout_rules
    SET bps = ?, active = ?, label = ?, rank_order = ?
    WHERE id = ? AND season_id = ?
  `);

  const updateSeasonBonus = db.prepare(`
    UPDATE season_bonus_rules
    SET bps = ?, active = ?, label = ?, rank_order = ?
    WHERE id = ? AND season_id = ?
  `);

  db.transaction(() => {
    [grand_prix, sprint].forEach((rules) => {
      if (!Array.isArray(rules)) return;
      rules.forEach((rule) => {
        updateEventRule.run(
          parseInt(rule.bps, 10) || 0,
          rule.active ? 1 : 0,
          String(rule.label || ''),
          parseInt(rule.rank_order, 10) || 1,
          rule.id,
          seasonId,
        );
      });
    });

    if (Array.isArray(season_bonus)) {
      season_bonus.forEach((rule) => {
        updateSeasonBonus.run(
          parseInt(rule.bps, 10) || 0,
          rule.active ? 1 : 0,
          String(rule.label || ''),
          parseInt(rule.rank_order, 10) || 1,
          rule.id,
          seasonId,
        );
      });
    }
  })();

  recalcSeasonBonuses({ seasonId });
  req.app.get('io')?.emit('standings:update');

  return res.json({ ok: true });
});

router.post('/results/sync-next', withAdmin, async (req, res) => {
  const seasonId = getActiveSeasonId();
  const provider = req.app.get('resultsProvider');
  const force = req.query?.force === '1' || req.body?.force === true;

  const result = await syncNextEventFromProvider({
    seasonId,
    provider,
    io: req.app.get('io'),
    includeFuture: force,
    ignoreLock: force,
  });

  if (!result.ok) return res.status(result.status || 500).json({ error: result.error });
  return res.json({ ok: true, ...result });
});

router.post('/results/advance-next', withAdmin, async (req, res) => {
  const seasonId = getActiveSeasonId();
  const provider = req.app.get('resultsProvider');

  const result = await syncNextEventFromProvider({
    seasonId,
    provider,
    io: req.app.get('io'),
    includeFuture: true,
    ignoreLock: true,
  });

  if (!result.ok) return res.status(result.status || 500).json({ error: result.error });
  return res.json({ ok: true, ...result });
});

router.post('/results/sync-event/:id', withAdmin, async (req, res) => {
  const seasonId = getActiveSeasonId();
  const eventId = parseInt(req.params.id, 10);
  const provider = req.app.get('resultsProvider');
  const force = req.query?.force === '1' || req.body?.force === true;

  const result = await syncEventFromProvider({
    seasonId,
    eventId,
    provider,
    io: req.app.get('io'),
    ignoreLock: force,
  });

  if (!result.ok) return res.status(result.status || 500).json({ error: result.error });
  return res.json({ ok: true, ...result });
});

router.get('/results/event/:id', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const eventId = parseInt(req.params.id, 10);

  const event = getEventById(seasonId, eventId);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  return res.json({
    event,
    drivers: getDrivers(seasonId),
    results: getEventResults(eventId),
  });
});

router.patch('/results/event/:id', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const eventId = parseInt(req.params.id, 10);
  const rows = req.body?.results;
  const force = req.query?.force === '1' || req.body?.force === true;

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'results must be a non-empty array' });
  }

  const upsertResult = upsertEventResults({
    seasonId,
    eventId,
    rows,
    manualOverride: true,
  });

  if (!upsertResult.ok) {
    return res.status(upsertResult.status || 400).json({ error: upsertResult.error });
  }

  const scoreResult = scoreEvent({ seasonId, eventId, ignoreLock: force });
  if (!scoreResult.ok) {
    return res.status(scoreResult.status || 400).json({ error: scoreResult.error });
  }

  req.app.get('io')?.emit('event:scored', { eventId });
  req.app.get('io')?.emit('standings:update');

  return res.json({ ok: true, rowCount: upsertResult.rowCount });
});

router.post('/results/recalc-season-bonuses', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const result = recalcSeasonBonuses({ seasonId });
  req.app.get('io')?.emit('standings:update');
  return res.json({ ok: true, ...result });
});

router.get('/results/season-bonus-payouts', withAdmin, (req, res) => {
  const seasonId = getActiveSeasonId();
  const rows = db.prepare(`
    SELECT sbp.id, sbp.category, sbp.amount_cents, sbp.tie_count,
           p.name as participant_name,
           d.code as driver_code,
           d.name as driver_name
    FROM season_bonus_payouts sbp
    JOIN participants p ON p.id = sbp.participant_id
    LEFT JOIN drivers d ON d.id = sbp.driver_id
    WHERE sbp.season_id = ?
    ORDER BY sbp.category ASC, sbp.amount_cents DESC, p.name ASC
  `).all(seasonId);

  const totals = db.prepare(`
    SELECT category, SUM(amount_cents) as total_cents
    FROM season_bonus_payouts
    WHERE season_id = ?
    GROUP BY category
    ORDER BY category ASC
  `).all(seasonId);

  return res.json({ rows, totals });
});

module.exports = router;
