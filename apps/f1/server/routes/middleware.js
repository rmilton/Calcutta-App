const { getParticipantByToken } = require('../db');

function getTokenFromReq(req) {
  return req.cookies?.session || null;
}

function requireAuth(req, res, next) {
  const token = getTokenFromReq(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const participant = getParticipantByToken(token);
  if (!participant) return res.status(401).json({ error: 'Unauthorized' });
  req.participant = participant;
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.participant) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.participant.is_admin) return res.status(403).json({ error: 'Admin only' });
  return next();
}

module.exports = {
  requireAuth,
  requireAdmin,
};
