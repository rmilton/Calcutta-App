const express = require('express');
const { db, getActiveTournamentId } = require('../db');
const { requireAdmin } = require('./middleware');

const router = express.Router();

// GET /api/admin/export/csv
// Downloads a CSV with standings summary + team ownership detail for settling up.
router.get('/csv', requireAdmin, (req, res) => {
  const tid = getActiveTournamentId();

  // Section 1: one row per participant in this tournament
  const standings = db.prepare(`
    SELECT p.name,
           COUNT(o.id)                        AS teams_owned,
           COALESCE(SUM(o.purchase_price), 0) AS total_spent,
           COALESCE(SUM(e2.amount), 0)        AS total_earned
    FROM participants p
    JOIN tournament_participants tp ON tp.participant_id = p.id AND tp.tournament_id = ?
    LEFT JOIN ownership o  ON o.participant_id = p.id AND o.tournament_id = ?
    LEFT JOIN earnings  e2 ON e2.participant_id = p.id AND e2.tournament_id = ?
    GROUP BY p.id, p.name
    ORDER BY total_earned DESC, total_spent ASC
  `).all(tid, tid, tid);

  // Section 2: all teams in this tournament (sold or not), with owner + earnings
  const teams = db.prepare(`
    SELECT t.region, t.seed, t.name AS team_name, t.eliminated,
           p.name          AS owner_name,
           o.purchase_price,
           COALESCE(SUM(e.amount), 0) AS total_earned
    FROM teams t
    LEFT JOIN ownership    o ON o.team_id = t.id AND o.tournament_id = ?
    LEFT JOIN participants p ON p.id = o.participant_id
    LEFT JOIN earnings     e ON e.team_id = t.id AND e.tournament_id = ?
    WHERE t.tournament_id = ?
    GROUP BY t.id
    ORDER BY t.region, t.seed
  `).all(tid, tid, tid);

  // Escape a single CSV value (wrap in quotes, double any internal quotes)
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const row = (...cols) => cols.map(esc).join(',');

  const lines = [];

  // ── Section 1: Standings ────────────────────────────────────────────────────
  lines.push('STANDINGS');
  lines.push(row('Rank', 'Name', 'Teams', 'Total Spent', 'Total Earned', 'Net'));
  standings.forEach((r, i) => {
    const net = r.total_earned - r.total_spent;
    lines.push(row(
      i + 1,
      r.name,
      r.teams_owned,
      Number(r.total_spent).toFixed(2),
      Number(r.total_earned).toFixed(2),
      net.toFixed(2),
    ));
  });

  lines.push(''); // blank row between sections

  // ── Section 2: Team ownership & earnings ───────────────────────────────────
  lines.push('TEAM OWNERSHIP & EARNINGS');
  lines.push(row('Region', 'Seed', 'Team', 'Owner', 'Purchase Price', 'Earnings', 'Status'));
  teams.forEach((t) => {
    lines.push(row(
      t.region,
      t.seed,
      t.team_name,
      t.owner_name ?? '(unsold)',
      t.purchase_price != null ? Number(t.purchase_price).toFixed(2) : '',
      Number(t.total_earned).toFixed(2),
      t.eliminated ? 'Eliminated' : 'Active',
    ));
  });

  const today = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="calcutta-${today}.csv"`);
  res.send(lines.join('\n'));
});

module.exports = router;
