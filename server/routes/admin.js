const express = require('express');
const {
  db,
  getActiveTournamentId,
  getTournamentSetting, setTournamentSetting,
  getAuctionItems, getActiveAuctionItem, seedTeamsForTournament, applyAuctionOrder,
  recalcEarnings, getPayoutConfig,
  TOURNAMENT_SETTING_KEYS,
} = require('../db');
const { requireAdmin } = require('./middleware');
const { scheduleAuctionStart, clearScheduledStart } = require('../scheduler');

const router = express.Router();

// GET /api/admin/settings
router.get('/settings', requireAdmin, (req, res) => {
  const tid = getActiveTournamentId();
  const keys = TOURNAMENT_SETTING_KEYS.filter(k => k !== 'name');
  const settings = {};
  for (const k of keys) settings[k] = getTournamentSetting(tid, k);
  res.json(settings);
});

// PATCH /api/admin/settings
router.patch('/settings', requireAdmin, (req, res) => {
  const tid = getActiveTournamentId();
  const allowed = [
    'auction_timer_seconds', 'auction_grace_seconds',
    'auction_order', 'auction_auto_advance', 'ai_commentary_enabled',
    'auction_scheduled_start',
  ];
  for (const [k, v] of Object.entries(req.body)) {
    if (allowed.includes(k)) setTournamentSetting(tid, k, v);
  }
  if (req.body.auction_order) {
    applyAuctionOrder(tid, req.body.auction_order);
  }
  // Handle scheduled start: re-arm (or cancel) the server-side timer
  const io = req.app.get('io');
  if ('auction_scheduled_start' in req.body) {
    const rawTs = req.body.auction_scheduled_start;
    const ts = rawTs ? parseInt(rawTs) : null;
    if (ts && ts > Date.now()) {
      scheduleAuctionStart(tid, ts, io);
      if (io) io.emit('auction:scheduled_start', { ts });
    } else {
      clearScheduledStart();
      if (io) io.emit('auction:scheduled_start', { ts: null });
    }
  }
  res.json({ ok: true });
});

// POST /api/admin/invite-code/regenerate
router.post('/invite-code/regenerate', requireAdmin, (req, res) => {
  const tid = getActiveTournamentId();
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  setTournamentSetting(tid, 'invite_code', code);
  res.json({ invite_code: code });
});

// GET /api/admin/participants
router.get('/participants', requireAdmin, (req, res) => {
  const tid = getActiveTournamentId();
  const participants = db.prepare(`
    SELECT p.id, p.name, p.color, p.is_admin, p.created_at
    FROM participants p
    JOIN tournament_participants tp ON tp.participant_id = p.id
    WHERE tp.tournament_id = ?
    ORDER BY tp.joined_at
  `).all(tid);
  res.json(participants);
});

// DELETE /api/admin/participants/:id
// Removes participant from the active tournament only; preserves their global account
router.delete('/participants/:id', requireAdmin, (req, res) => {
  const tid = getActiveTournamentId();
  const { id } = req.params;
  db.prepare('DELETE FROM tournament_participants WHERE tournament_id = ? AND participant_id = ? AND (SELECT is_admin FROM participants WHERE id = ?) = 0')
    .run(tid, id, id);
  res.json({ ok: true });
});

// GET /api/admin/payouts
router.get('/payouts', requireAdmin, (req, res) => {
  const tid = getActiveTournamentId();
  res.json(getPayoutConfig(tid));
});

// PATCH /api/admin/payouts
router.patch('/payouts', requireAdmin, (req, res) => {
  const tid = getActiveTournamentId();
  const { payouts } = req.body; // [{ round_number, amount, payout_type }]
  if (!Array.isArray(payouts)) return res.status(400).json({ error: 'payouts must be array' });
  const update = db.prepare(
    'UPDATE payout_config SET amount = ?, payout_type = ? WHERE round_number = ? AND tournament_id = ?'
  );
  db.transaction(() => {
    for (const p of payouts) {
      const type = p.payout_type === 'percent' ? 'percent' : 'fixed';
      update.run(parseFloat(p.amount) || 0, type, p.round_number, tid);
    }
  })();
  recalcEarnings(tid);
  const io = req.app.get('io');
  if (io) io.emit('standings:update');
  res.json({ ok: true });
});

// POST /api/admin/payouts/recalc
router.post('/payouts/recalc', requireAdmin, (req, res) => {
  const tid = getActiveTournamentId();
  recalcEarnings(tid);
  const io = req.app.get('io');
  if (io) io.emit('standings:update');
  res.json({ ok: true });
});

// GET /api/admin/auction/queue
router.get('/auction/queue', requireAdmin, (req, res) => {
  const tid = getActiveTournamentId();
  res.json(getAuctionItems(tid));
});

// PATCH /api/admin/auction/queue  - reorder pending items
router.patch('/auction/queue', requireAdmin, (req, res) => {
  const { order } = req.body; // [{ id, queue_order }]
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be array' });
  const update = db.prepare('UPDATE auction_items SET queue_order = ? WHERE id = ? AND status = ?');
  db.transaction(() => {
    for (const item of order) update.run(item.queue_order, item.id, 'pending');
  })();
  res.json({ ok: true });
});

// POST /api/admin/auction/start
router.post('/auction/start', requireAdmin, (req, res) => {
  const tid = getActiveTournamentId();
  clearScheduledStart(); // cancel any pending auto-start
  setTournamentSetting(tid, 'auction_status', 'open');
  setTournamentSetting(tid, 'auction_scheduled_start', '');
  const io = req.app.get('io');
  if (io) {
    io.emit('auction:status', { status: 'open' });
    io.emit('auction:scheduled_start', { ts: null }); // clear client countdown
  }
  res.json({ ok: true });
});

// POST /api/admin/auction/pause
router.post('/auction/pause', requireAdmin, (req, res) => {
  const tid = getActiveTournamentId();
  setTournamentSetting(tid, 'auction_status', 'paused');
  const io = req.app.get('io');
  if (io) io.emit('auction:status', { status: 'paused' });
  res.json({ ok: true });
});

// POST /api/admin/auction/next
router.post('/auction/next', requireAdmin, (req, res) => {
  const tid = getActiveTournamentId();
  const { teamId } = req.body;

  const currentActive = getActiveAuctionItem(tid);
  if (currentActive) return res.status(400).json({ error: 'An auction is already active. Close it first.' });

  let item;
  if (teamId) {
    item = db.prepare(
      "SELECT * FROM auction_items WHERE team_id = ? AND status = 'pending' AND tournament_id = ?"
    ).get(teamId, tid);
  } else {
    item = db.prepare(
      "SELECT * FROM auction_items WHERE status = 'pending' AND tournament_id = ? ORDER BY queue_order LIMIT 1"
    ).get(tid);
  }
  if (!item) return res.status(404).json({ error: 'No pending teams' });

  const timerSeconds = parseInt(getTournamentSetting(tid, 'auction_timer_seconds') || '30');
  const endTime = Date.now() + timerSeconds * 1000;

  db.prepare(
    "UPDATE auction_items SET status = 'active', bid_end_time = ?, current_price = 0 WHERE id = ?"
  ).run(endTime, item.id);

  const io = req.app.get('io');
  if (io) {
    const auctionModule = req.app.get('auctionModule');
    if (auctionModule) auctionModule.startTimer(item.id, endTime);
    io.emit('auction:started', { itemId: item.id, teamId: item.team_id, endTime });
  }

  res.json({ ok: true, itemId: item.id });
});

// POST /api/admin/auction/close
router.post('/auction/close', requireAdmin, (req, res) => {
  const tid = getActiveTournamentId();
  const active = getActiveAuctionItem(tid);
  if (!active) return res.status(400).json({ error: 'No active auction' });

  const io = req.app.get('io');
  const auctionModule = req.app.get('auctionModule');
  if (auctionModule) auctionModule.closeAuction(active.id, io);

  res.json({ ok: true });
});

// POST /api/admin/bracket/initialize
router.post('/bracket/initialize', requireAdmin, (req, res) => {
  const tid = getActiveTournamentId();
  const tournamentStarted = getTournamentSetting(tid, 'tournament_started');
  if (tournamentStarted === '1') return res.status(400).json({ error: 'Tournament already initialized' });

  const regions = ['East', 'West', 'South', 'Midwest'];
  const matchups = [
    [1, 16], [8, 9], [5, 12], [4, 13],
    [6, 11], [3, 14], [7, 10], [2, 15],
  ];

  db.transaction(() => {
    db.prepare('DELETE FROM games WHERE tournament_id = ?').run(tid);

    regions.forEach((region) => {
      matchups.forEach(([s1, s2], idx) => {
        const t1 = db.prepare('SELECT id FROM teams WHERE region = ? AND seed = ? AND tournament_id = ?').get(region, s1, tid);
        const t2 = db.prepare('SELECT id FROM teams WHERE region = ? AND seed = ? AND tournament_id = ?').get(region, s2, tid);
        if (t1 && t2) {
          db.prepare(
            'INSERT INTO games (round, region, position, team1_id, team2_id, tournament_id) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(1, region, idx + 1, t1.id, t2.id, tid);
        }
      });
    });

    setTournamentSetting(tid, 'tournament_started', '1');
  })();

  const io = req.app.get('io');
  if (io) io.emit('bracket:initialized');

  res.json({ ok: true });
});

// POST /api/admin/bracket/reset
router.post('/bracket/reset', requireAdmin, (req, res) => {
  const tid = getActiveTournamentId();
  db.transaction(() => {
    db.prepare('DELETE FROM earnings WHERE tournament_id = ?').run(tid);
    db.prepare('DELETE FROM games WHERE tournament_id = ?').run(tid);
    db.prepare('UPDATE teams SET eliminated = 0 WHERE tournament_id = ?').run(tid);
    setTournamentSetting(tid, 'tournament_started', '0');
  })();

  const io = req.app.get('io');
  if (io) io.emit('bracket:reset');

  res.json({ ok: true });
});

// POST /api/admin/teams/import
router.post('/teams/import', requireAdmin, (req, res) => {
  const tid = getActiveTournamentId();
  const { teams } = req.body;
  if (!Array.isArray(teams) || teams.length !== 64) {
    return res.status(400).json({ error: 'Must provide exactly 64 teams' });
  }
  const valid = teams.every(
    (t) => t.name && typeof t.seed === 'number' && ['East', 'West', 'South', 'Midwest'].includes(t.region)
  );
  if (!valid) return res.status(400).json({ error: 'Invalid team data' });

  seedTeamsForTournament(tid, teams);

  const io = req.app.get('io');
  if (io) io.emit('teams:imported');

  res.json({ ok: true });
});

module.exports = router;
