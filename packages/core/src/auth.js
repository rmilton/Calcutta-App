function sanitizeParticipantName(name) {
  return String(name || '').trim().substring(0, 32);
}

function generateInviteCode(length = 6) {
  return Math.random().toString(36).substring(2, 2 + length).toUpperCase();
}

module.exports = {
  sanitizeParticipantName,
  generateInviteCode,
};
