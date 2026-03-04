const express = require('express');
const { db, getActiveTournamentId, getFullStandings, getOwnership, getPayoutConfig, getTotalPot } = require('../db');
const { requireAuth } = require('./middleware');

const router = express.Router();

function resolveTid(req) {
  return req.query.t ? parseInt(req.query.t) : getActiveTournamentId();
}

// GET /api/standings
router.get('/', requireAuth, (req, res) => {
  const tid = resolveTid(req);
  const standings = getFullStandings(tid);
  const totalPot = getTotalPot(tid);
  res.json({ standings, totalPot });
});

// GET /api/standings/ownership
router.get('/ownership', requireAuth, (req, res) => {
  const tid = resolveTid(req);
  res.json(getOwnership(tid));
});

// GET /api/standings/participant/:id
router.get('/participant/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const tid = resolveTid(req);

  const participant = db.prepare('SELECT id, name, color FROM participants WHERE id = ?').get(id);
  if (!participant) return res.status(404).json({ error: 'Not found' });

  const teams = db.prepare(`
    SELECT o.purchase_price, t.*,
           COALESCE(SUM(e.amount), 0) as earnings,
           (SELECT g.round FROM games g
            WHERE (g.team1_id = t.id OR g.team2_id = t.id)
              AND g.winner_id IS NOT NULL
              AND g.winner_id != t.id
              AND g.tournament_id = ?
            LIMIT 1) as eliminated_round,
           (SELECT g.round FROM games g
            WHERE (g.team1_id = t.id OR g.team2_id = t.id)
              AND g.winner_id IS NULL
              AND g.tournament_id = ?
            ORDER BY g.round ASC, g.position ASC
            LIMIT 1) as next_game_round,
           (SELECT g.tipoff_at FROM games g
            WHERE (g.team1_id = t.id OR g.team2_id = t.id)
              AND g.winner_id IS NULL
              AND g.tournament_id = ?
            ORDER BY g.round ASC, g.position ASC
            LIMIT 1) as next_game_tipoff_at,
           (SELECT g.tv_network FROM games g
            WHERE (g.team1_id = t.id OR g.team2_id = t.id)
              AND g.winner_id IS NULL
              AND g.tournament_id = ?
            ORDER BY g.round ASC, g.position ASC
            LIMIT 1) as next_game_tv_network,
           (SELECT g.round FROM games g
            WHERE (g.team1_id = t.id OR g.team2_id = t.id)
              AND g.winner_id IS NOT NULL
              AND g.tournament_id = ?
            ORDER BY g.round DESC, g.position DESC
            LIMIT 1) as last_game_round,
           (SELECT g.tipoff_at FROM games g
            WHERE (g.team1_id = t.id OR g.team2_id = t.id)
              AND g.winner_id IS NOT NULL
              AND g.tournament_id = ?
            ORDER BY g.round DESC, g.position DESC
            LIMIT 1) as last_game_tipoff_at,
           (SELECT g.tv_network FROM games g
            WHERE (g.team1_id = t.id OR g.team2_id = t.id)
              AND g.winner_id IS NOT NULL
              AND g.tournament_id = ?
            ORDER BY g.round DESC, g.position DESC
            LIMIT 1) as last_game_tv_network
    FROM ownership o
    JOIN teams t ON o.team_id = t.id
    LEFT JOIN earnings e ON e.team_id = t.id AND e.participant_id = o.participant_id AND e.tournament_id = ?
    WHERE o.participant_id = ? AND o.tournament_id = ?
    GROUP BY t.id
    ORDER BY t.region, t.seed
  `).all(tid, tid, tid, tid, tid, tid, tid, tid, id, tid);

  const totalSpent = teams.reduce((s, t) => s + t.purchase_price, 0);
  const totalEarned = teams.reduce((s, t) => s + t.earnings, 0);

  res.json({ participant, teams, totalSpent, totalEarned });
});

module.exports = router;
