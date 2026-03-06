const express = require('express');
const { v4: uuidv4 } = require('uuid');
const {
  sanitizeParticipantName,
} = require('../lib/core');
const {
  db,
  getActiveSeasonId,
  getActiveSeason,
  getParticipantByToken,
} = require('../db');

const router = express.Router();

const COLORS = [
  '#ff4d4f', '#ff7a45', '#ff9c22', '#fadb14',
  '#73d13d', '#36cfc9', '#40a9ff', '#597ef7',
  '#9254de', '#f759ab', '#13c2c2', '#5cdbd3',
];

function emitParticipantsUpdate(req, seasonId) {
  req.app.get('io')?.emit('participants:update', { seasonId });
}

router.get('/me', (req, res) => {
  const token = req.cookies?.session;
  if (!token) return res.json({ participant: null });

  const participant = getParticipantByToken(token);
  if (!participant) return res.json({ participant: null });

  const seasonId = getActiveSeasonId();
  const inSeason = db.prepare(`
    SELECT 1
    FROM season_participants
    WHERE season_id = ? AND participant_id = ?
  `).get(seasonId, participant.id);

  if (!participant.is_admin && !inSeason) {
    return res.json({ participant: null });
  }

  return res.json({
    participant: {
      id: participant.id,
      name: participant.name,
      color: participant.color,
      isAdmin: !!participant.is_admin,
    },
  });
});

router.post('/join', (req, res) => {
  const { name, inviteCode } = req.body;
  if (!name || !inviteCode) return res.status(400).json({ error: 'Name and invite code required' });

  const season = getActiveSeason();
  if (!season) return res.status(500).json({ error: 'No active season found' });

  if (String(inviteCode).trim().toUpperCase() !== String(season.invite_code).trim().toUpperCase()) {
    return res.status(401).json({ error: 'Invalid invite code' });
  }

  const cleanName = sanitizeParticipantName(name);
  if (!cleanName) return res.status(400).json({ error: 'Name cannot be empty' });

  const existing = db.prepare('SELECT * FROM participants WHERE LOWER(name) = LOWER(?)').get(cleanName);
  if (existing) {
    const token = existing.session_token || uuidv4();
    if (!existing.session_token) {
      db.prepare('UPDATE participants SET session_token = ? WHERE id = ?').run(token, existing.id);
    }

    db.prepare(`
      INSERT OR IGNORE INTO season_participants (season_id, participant_id)
      VALUES (?, ?)
    `).run(season.id, existing.id);

    emitParticipantsUpdate(req, season.id);

    res.cookie('session', token, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
    return res.json({
      participant: {
        id: existing.id,
        name: existing.name,
        color: existing.color,
        isAdmin: !!existing.is_admin,
      },
    });
  }

  const usedColors = db.prepare('SELECT color FROM participants').all().map((row) => row.color);
  const color = COLORS.find((c) => !usedColors.includes(c)) || COLORS[Math.floor(Math.random() * COLORS.length)];
  const token = uuidv4();

  const participantId = db.prepare(`
    INSERT INTO participants (name, color, session_token)
    VALUES (?, ?, ?)
  `).run(cleanName, color, token).lastInsertRowid;

  db.prepare(`
    INSERT INTO season_participants (season_id, participant_id)
    VALUES (?, ?)
  `).run(season.id, participantId);

  emitParticipantsUpdate(req, season.id);

  res.cookie('session', token, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
  return res.json({
    participant: {
      id: participantId,
      name: cleanName,
      color,
      isAdmin: false,
    },
  });
});

router.post('/admin', (req, res) => {
  const { password } = req.body;
  const expected = process.env.ADMIN_PASSWORD || 'admin123';
  if (password !== expected) return res.status(401).json({ error: 'Wrong password' });

  let admin = db.prepare('SELECT * FROM participants WHERE is_admin = 1 LIMIT 1').get();
  if (!admin) {
    const token = uuidv4();
    const id = db.prepare(`
      INSERT INTO participants (name, color, is_admin, session_token)
      VALUES ('Admin', '#202734', 1, ?)
    `).run(token).lastInsertRowid;
    admin = db.prepare('SELECT * FROM participants WHERE id = ?').get(id);
  } else if (!admin.session_token) {
    const token = uuidv4();
    db.prepare('UPDATE participants SET session_token = ? WHERE id = ?').run(token, admin.id);
    admin = db.prepare('SELECT * FROM participants WHERE id = ?').get(admin.id);
  }

  db.prepare(`
    INSERT OR IGNORE INTO season_participants (season_id, participant_id)
    VALUES (?, ?)
  `).run(getActiveSeasonId(), admin.id);

  res.cookie('session', admin.session_token, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
  return res.json({
    participant: {
      id: admin.id,
      name: admin.name,
      color: admin.color,
      isAdmin: true,
    },
  });
});

router.post('/logout', (req, res) => {
  res.clearCookie('session');
  res.json({ ok: true });
});

module.exports = router;
