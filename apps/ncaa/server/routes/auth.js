const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db, getActiveTournamentId, getTournament, getParticipantByToken } = require('../db');

const router = express.Router();

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#6366f1', '#a855f7', '#ec4899',
  '#14b8a6', '#84cc16', '#f59e0b', '#3b82f6',
];

// GET /api/auth/me  - validate session
router.get('/me', (req, res) => {
  const token = req.cookies?.session;
  if (!token) return res.json({ participant: null });
  const participant = getParticipantByToken(token);
  if (!participant) return res.json({ participant: null });
  res.json({
    participant: {
      id: participant.id,
      name: participant.name,
      color: participant.color,
      isAdmin: !!participant.is_admin,
    },
  });
});

// POST /api/auth/join  - join as participant
router.post('/join', (req, res) => {
  const { name, inviteCode } = req.body;
  if (!name || !inviteCode) return res.status(400).json({ error: 'Name and invite code required' });

  const tid = getActiveTournamentId();
  const tournament = getTournament(tid);
  if (!tournament) return res.status(500).json({ error: 'No active tournament found' });

  if (inviteCode.toUpperCase().trim() !== tournament.invite_code.toUpperCase().trim()) {
    return res.status(401).json({ error: 'Invalid invite code' });
  }

  const trimmedName = name.trim().substring(0, 32);
  if (!trimmedName) return res.status(400).json({ error: 'Name cannot be empty' });

  // Check if name already exists, reuse session
  const existing = db.prepare('SELECT * FROM participants WHERE LOWER(name) = LOWER(?)').get(trimmedName);
  if (existing) {
    const token = existing.session_token || uuidv4();
    if (!existing.session_token) {
      db.prepare('UPDATE participants SET session_token = ? WHERE id = ?').run(token, existing.id);
    }
    // Ensure they're in this tournament's participant list
    db.prepare('INSERT OR IGNORE INTO tournament_participants (tournament_id, participant_id) VALUES (?, ?)')
      .run(tid, existing.id);
    res.cookie('session', token, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
    return res.json({
      participant: { id: existing.id, name: existing.name, color: existing.color, isAdmin: !!existing.is_admin },
    });
  }

  const usedColors = db.prepare('SELECT color FROM participants').all().map((p) => p.color);
  const color = COLORS.find((c) => !usedColors.includes(c)) || COLORS[Math.floor(Math.random() * COLORS.length)];
  const token = uuidv4();

  const result = db.prepare(
    'INSERT INTO participants (name, color, session_token) VALUES (?, ?, ?)'
  ).run(trimmedName, color, token);

  const newParticipantId = result.lastInsertRowid;

  // Add to this tournament's participant list
  db.prepare('INSERT OR IGNORE INTO tournament_participants (tournament_id, participant_id) VALUES (?, ?)')
    .run(tid, newParticipantId);

  res.cookie('session', token, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.json({
    participant: { id: newParticipantId, name: trimmedName, color, isAdmin: false },
  });
});

// POST /api/auth/admin - admin login
router.post('/admin', (req, res) => {
  const { password } = req.body;
  const expected = process.env.ADMIN_PASSWORD || 'admin123';
  if (password !== expected) return res.status(401).json({ error: 'Wrong password' });

  // Find or create admin participant
  let admin = db.prepare("SELECT * FROM participants WHERE is_admin = 1").get();
  if (!admin) {
    const token = uuidv4();
    const result = db.prepare(
      "INSERT INTO participants (name, color, is_admin, session_token) VALUES ('Admin', '#1e293b', 1, ?)"
    ).run(token);
    admin = db.prepare('SELECT * FROM participants WHERE id = ?').get(result.lastInsertRowid);
  } else if (!admin.session_token) {
    const token = uuidv4();
    db.prepare('UPDATE participants SET session_token = ? WHERE id = ?').run(token, admin.id);
    admin = db.prepare('SELECT * FROM participants WHERE id = ?').get(admin.id);
  }

  res.cookie('session', admin.session_token, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.json({
    participant: { id: admin.id, name: admin.name, color: admin.color, isAdmin: true },
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('session');
  res.json({ ok: true });
});

module.exports = router;
