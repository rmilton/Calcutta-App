const { getActiveTournamentId, getParticipantByToken } = require('./db');

function setupSocket(io, auctionService) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.cookie
      ?.split(';').find((c) => c.trim().startsWith('session='))?.split('=')[1];

    if (!token) return next(new Error('Not authenticated'));
    const participant = getParticipantByToken(token);
    if (!participant) return next(new Error('Invalid session'));
    socket.participant = participant;
    next();
  });

  io.on('connection', (socket) => {
    const p = socket.participant;
    console.log(`[socket] ${p.name} connected`);

    auctionService.emitAuctionState(socket, getActiveTournamentId());

    socket.on('auction:bid', (data) => {
      const result = auctionService.placeBid({ participant: p, amount: data?.amount });
      if (!result.ok) socket.emit('auction:error', { message: result.error });
    });

    socket.on('disconnect', () => {
      console.log(`[socket] ${p.name} disconnected`);
    });
  });

  auctionService.restoreTimerOnStartup();
}

module.exports = { setupSocket };
