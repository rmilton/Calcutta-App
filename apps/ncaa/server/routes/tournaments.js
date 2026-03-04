const express = require('express');
const {
  db,
  getActiveTournamentId, setActiveTournamentId,
  getTournament, getAllTournaments, createTournament,
  seedTeamsForTournament, getTournamentSetting,
} = require('../db');
const { requireAuth, requireAdmin } = require('./middleware');
const { TEAMS_2025 } = require('../data/teams2025');

const router = express.Router();

// GET /api/tournaments/active  — current active tournament (authenticated)
router.get('/active', requireAuth, (req, res) => {
  const tid = getActiveTournamentId();
  const tournament = getTournament(tid);
  if (!tournament) return res.status(404).json({ error: 'No active tournament' });
  res.json(tournament);
});

// GET /api/tournaments  — list all tournaments (admin only)
router.get('/', requireAdmin, (req, res) => {
  res.json(getAllTournaments());
});

// POST /api/tournaments  — create a new tournament (admin only)
router.post('/', requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Tournament name is required' });

  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const newTid = createTournament({ name: name.trim(), inviteCode });

  // Seed the new tournament with the default 2025 teams so it's ready to go
  seedTeamsForTournament(newTid, TEAMS_2025);

  const tournament = getTournament(newTid);
  res.json({ ok: true, tournament });
});

// POST /api/tournaments/:id/activate  — switch the active tournament (admin only)
router.post('/:id/activate', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const tournament = getTournament(id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

  setActiveTournamentId(id);

  const io = req.app.get('io');
  if (io) io.emit('tournament:switched', { tournamentId: id, name: tournament.name });

  res.json({ ok: true, tournamentId: id, name: tournament.name });
});

module.exports = router;
