const { getParticipantByToken } = require('../db');

function requireAuth(req, res, next) {
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const participant = getParticipantByToken(token);
  if (!participant) return res.status(401).json({ error: 'Invalid session' });
  req.participant = participant;
  next();
}

function requireAdmin(req, res, next) {
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const participant = getParticipantByToken(token);
  if (!participant || !participant.is_admin) return res.status(403).json({ error: 'Admin only' });
  req.participant = participant;
  next();
}

module.exports = { requireAuth, requireAdmin };
