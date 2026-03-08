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
  getResolvedAuctionStatus,
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

function cookieOptions() {
  return { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 };
}

function getJoinPolicy(seasonId) {
  const auctionStatus = getResolvedAuctionStatus(seasonId);
  return {
    auctionStatus,
    creationLocked: auctionStatus === 'complete',
  };
}

function findSeasonParticipantsByName(seasonId, cleanName) {
  return db.prepare(`
    SELECT p.*
    FROM participants p
    JOIN season_participants sp ON sp.participant_id = p.id
    WHERE sp.season_id = ?
      AND p.is_admin = 0
      AND LOWER(p.name) = LOWER(?)
  `).all(seasonId, cleanName);
}

function findParticipantsByName(cleanName) {
  return db.prepare(`
    SELECT *
    FROM participants
    WHERE is_admin = 0
      AND LOWER(name) = LOWER(?)
  `).all(cleanName);
}

function ensureParticipantToken(participant) {
  if (participant.session_token) return participant.session_token;
  const token = uuidv4();
  db.prepare('UPDATE participants SET session_token = ? WHERE id = ?').run(token, participant.id);
  return token;
}

function sendParticipantSession(res, participant, token) {
  res.cookie('session', token, cookieOptions());
  return res.json({
    participant: {
      id: participant.id,
      name: participant.name,
      color: participant.color,
      isAdmin: !!participant.is_admin,
    },
  });
}

function logRejectedJoinAttempt({ seasonId, cleanName, reason }) {
  console.warn(`[auth.join] rejected season=${seasonId} name="${cleanName}" reason=${reason}`);
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

router.get('/join-policy', (req, res) => {
  const season = getActiveSeason();
  if (!season) return res.status(500).json({ error: 'No active season found' });
  return res.json(getJoinPolicy(season.id));
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

  const joinPolicy = getJoinPolicy(season.id);
  const seasonMatches = findSeasonParticipantsByName(season.id, cleanName);
  if (seasonMatches.length > 1) {
    logRejectedJoinAttempt({ seasonId: season.id, cleanName, reason: 'ambiguous-season-match' });
    return res.status(409).json({
      error: 'Multiple participants share that name in this season roster. Contact the admin.',
    });
  }
  if (seasonMatches.length === 1) {
    const existing = seasonMatches[0];
    const token = ensureParticipantToken(existing);
    emitParticipantsUpdate(req, season.id);
    return sendParticipantSession(res, existing, token);
  }

  if (joinPolicy.creationLocked) {
    logRejectedJoinAttempt({ seasonId: season.id, cleanName, reason: 'creation-locked-no-match' });
    return res.status(403).json({
      error: 'No participant found for that name in this season roster. Contact the admin.',
    });
  }

  const globalMatches = findParticipantsByName(cleanName);
  if (globalMatches.length > 1) {
    logRejectedJoinAttempt({ seasonId: season.id, cleanName, reason: 'ambiguous-global-match' });
    return res.status(409).json({
      error: 'Multiple participants share that name. Contact the admin before joining.',
    });
  }
  if (globalMatches.length === 1) {
    const existing = globalMatches[0];
    const token = ensureParticipantToken(existing);
    db.prepare(`
      INSERT OR IGNORE INTO season_participants (season_id, participant_id)
      VALUES (?, ?)
    `).run(season.id, existing.id);
    emitParticipantsUpdate(req, season.id);
    return sendParticipantSession(res, existing, token);
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

  return sendParticipantSession(res, {
    id: participantId,
    name: cleanName,
    color,
    is_admin: 0,
  }, token);
});

router.get('/access/:token', (req, res) => {
  const token = String(req.params.token || '').trim();
  if (!token) return res.redirect('/join?error=invalid-access');

  const participant = getParticipantByToken(token);
  if (!participant) return res.redirect('/join?error=invalid-access');

  const seasonId = getActiveSeasonId();
  const inSeason = db.prepare(`
    SELECT 1
    FROM season_participants
    WHERE season_id = ? AND participant_id = ?
  `).get(seasonId, participant.id);

  if (!participant.is_admin && !inSeason) {
    return res.redirect('/join?error=invalid-access');
  }

  res.cookie('session', token, cookieOptions());
  return res.redirect(participant.is_admin ? '/admin' : '/dashboard');
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

  res.cookie('session', admin.session_token, cookieOptions());
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
