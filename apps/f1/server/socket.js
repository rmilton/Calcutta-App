const cookie = require('cookie');
const { getParticipantByToken, getActiveSeasonId } = require('./db');

function extractTokenFromSocket(socket) {
  if (socket.handshake.auth?.token) return socket.handshake.auth.token;

  const cookieHeader = socket.handshake.headers?.cookie;
  if (!cookieHeader) return null;
  const parsed = cookie.parse(cookieHeader);
  return parsed.session || null;
}

function setupSocket(io, auctionService) {
  io.use((socket, next) => {
    const token = extractTokenFromSocket(socket);
    if (!token) return next(new Error('Unauthorized'));

    const participant = getParticipantByToken(token);
    if (!participant) return next(new Error('Unauthorized'));

    socket.data.participant = participant;
    return next();
  });

  io.on('connection', (socket) => {
    const seasonId = getActiveSeasonId();
    auctionService.emitAuctionState(socket, seasonId);

    socket.on('auction:bid', ({ amountCents }) => {
      const result = auctionService.placeBid({
        participant: socket.data.participant,
        amountCents,
      });
      if (!result.ok) {
        socket.emit('auction:error', { error: result.error });
      }
    });
  });
}

module.exports = { setupSocket };
