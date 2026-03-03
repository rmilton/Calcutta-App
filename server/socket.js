const {
  db, getActiveTournamentId,
  getTournamentSetting,
  getParticipantByToken, getActiveAuctionItem, getRecentBids,
  getTotalPot,
} = require('./db');
const { generateAuctionCommentary } = require('./ai');

// Tracks active timer for the current auction
let activeTimer = null;
let activeItemId = null;

function startTimer(itemId, endTime) {
  if (activeTimer) clearTimeout(activeTimer);
  activeItemId = itemId;
  const delay = endTime - Date.now();
  if (delay <= 0) return;
  activeTimer = setTimeout(() => {
    const io = global._io;
    try {
      if (io) closeAuction(itemId, io);
    } catch (e) {
      console.error('[closeAuction timer]', e);
    }
  }, delay);
}

function generateSaleCommentary(item, winner, team, tid, io) {
  if (getTournamentSetting(tid, 'ai_commentary_enabled') === '0') return;

  const totalPot = getTotalPot(tid);
  const teamsRemaining = db.prepare(
    "SELECT COUNT(*) as c FROM auction_items WHERE status = 'pending' AND tournament_id = ?"
  ).get(tid).c;
  const winnerStats = db.prepare(
    'SELECT COUNT(*) as team_count, SUM(purchase_price) as total_spent FROM ownership WHERE participant_id = ? AND tournament_id = ?'
  ).get(item.current_leader_id, tid);

  generateAuctionCommentary({
    teamName: team?.name,
    seed: team?.seed,
    region: team?.region,
    price: item.current_price,
    winnerName: winner?.name,
    winnerTotalSpent: winnerStats?.total_spent || item.current_price,
    winnerTeamCount: winnerStats?.team_count || 1,
    totalPot,
    teamsRemaining,
  }, io).catch((e) => console.error('[AI auction]', e.message));
}

function autoAdvanceToNextItem(tid, io) {
  if (getTournamentSetting(tid, 'auction_auto_advance') !== '1') return;

  setTimeout(() => {
    const _tid = getActiveTournamentId();
    const nextItem = db.prepare(
      "SELECT * FROM auction_items WHERE status = 'pending' AND tournament_id = ? ORDER BY queue_order LIMIT 1"
    ).get(_tid);
    if (nextItem && getTournamentSetting(_tid, 'auction_status') === 'open') {
      const timerSeconds = parseInt(getTournamentSetting(_tid, 'auction_timer_seconds') || '30');
      const endTime = Date.now() + timerSeconds * 1000;
      db.prepare(
        "UPDATE auction_items SET status = 'active', bid_end_time = ?, current_price = 0 WHERE id = ?"
      ).run(endTime, nextItem.id);
      startTimer(nextItem.id, endTime);
      io.emit('auction:started', { itemId: nextItem.id, teamId: nextItem.team_id, endTime });
    }
  }, 3000);
}

function checkAuctionCompletion(tid, io) {
  const pending = db.prepare(
    "SELECT COUNT(*) as c FROM auction_items WHERE status IN ('pending', 'active') AND tournament_id = ?"
  ).get(tid).c;
  if (pending === 0) {
    io.emit('auction:complete');
  }
}

function closeAuction(itemId, io) {
  if (activeTimer) { clearTimeout(activeTimer); activeTimer = null; }

  const tid = getActiveTournamentId();

  const item = db.prepare(
    "SELECT * FROM auction_items WHERE id = ? AND status = 'active' AND tournament_id = ?"
  ).get(itemId, tid);
  if (!item) return;

  if (item.current_leader_id && item.current_price > 0) {
    // Sell to winner
    db.transaction(() => {
      db.prepare("UPDATE auction_items SET status = 'sold', winner_id = ?, final_price = ? WHERE id = ?")
        .run(item.current_leader_id, item.current_price, item.id);
      db.prepare(
        'INSERT OR REPLACE INTO ownership (tournament_id, team_id, participant_id, purchase_price) VALUES (?, ?, ?, ?)'
      ).run(tid, item.team_id, item.current_leader_id, item.current_price);
    })();

    const winner = db.prepare('SELECT name, color FROM participants WHERE id = ?').get(item.current_leader_id);
    const team = db.prepare('SELECT name, seed, region FROM teams WHERE id = ?').get(item.team_id);

    io.emit('auction:sold', {
      itemId,
      teamId: item.team_id,
      teamName: team?.name,
      winnerId: item.current_leader_id,
      winnerName: winner?.name,
      winnerColor: winner?.color,
      finalPrice: item.current_price,
    });

    generateSaleCommentary(item, winner, team, tid, io);
    autoAdvanceToNextItem(tid, io);
  } else {
    // No bids — mark as skipped/pending again for re-queue
    db.prepare(
      "UPDATE auction_items SET status = 'pending', bid_end_time = NULL, current_price = 0, current_leader_id = NULL WHERE id = ?"
    ).run(itemId);
    io.emit('auction:nobids', { itemId });
  }

  checkAuctionCompletion(tid, io);
}

function setupSocket(io) {
  global._io = io;

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.cookie
      ?.split(';').find(c => c.trim().startsWith('session='))?.split('=')[1];

    if (!token) return next(new Error('Not authenticated'));
    const participant = getParticipantByToken(token);
    if (!participant) return next(new Error('Invalid session'));
    socket.participant = participant;
    next();
  });

  io.on('connection', (socket) => {
    const p = socket.participant;
    console.log(`[socket] ${p.name} connected`);

    // Send current auction state on connect
    const tid = getActiveTournamentId();
    const active = getActiveAuctionItem(tid);
    const auctionStatus = getTournamentSetting(tid, 'auction_status');
    const rawScheduled = getTournamentSetting(tid, 'auction_scheduled_start');
    const scheduledStart = rawScheduled ? parseInt(rawScheduled) : null;
    if (active) {
      const recentBids = getRecentBids(active.team_id);
      socket.emit('auction:state', {
        active,
        recentBids,
        auctionStatus,
        scheduledStart,
      });
    } else {
      socket.emit('auction:state', {
        active: null,
        recentBids: [],
        auctionStatus,
        scheduledStart,
      });
    }

    // Place a bid
    socket.on('auction:bid', (data) => {
      if (p.is_admin) return socket.emit('auction:error', { message: 'Admin cannot place bids' });
      const { amount } = data;
      if (!amount || isNaN(amount)) return socket.emit('auction:error', { message: 'Invalid bid amount' });

      const bidAmount = parseFloat(parseFloat(amount).toFixed(2));
      const _tid = getActiveTournamentId();
      const active = getActiveAuctionItem(_tid);

      if (!active) return socket.emit('auction:error', { message: 'No active auction' });
      if (bidAmount <= active.current_price) {
        return socket.emit('auction:error', { message: `Bid must be greater than $${active.current_price}` });
      }
      if (active.current_leader_id === p.id) {
        return socket.emit('auction:error', { message: "You already have the highest bid" });
      }

      const auctionStatus = getTournamentSetting(_tid, 'auction_status');
      if (auctionStatus === 'paused') return socket.emit('auction:error', { message: 'Auction is paused' });

      // Reset timer
      const graceSeconds = parseInt(getTournamentSetting(_tid, 'auction_grace_seconds') || '15');
      const newEndTime = Math.max(Date.now() + graceSeconds * 1000, active.bid_end_time);

      db.transaction(() => {
        db.prepare('INSERT INTO bids (team_id, participant_id, amount, tournament_id) VALUES (?, ?, ?, ?)')
          .run(active.team_id, p.id, bidAmount, _tid);
        db.prepare('UPDATE auction_items SET current_price = ?, current_leader_id = ?, bid_end_time = ? WHERE id = ?')
          .run(bidAmount, p.id, newEndTime, active.id);
      })();

      startTimer(active.id, newEndTime);

      const recentBids = getRecentBids(active.team_id);

      io.emit('auction:update', {
        itemId: active.id,
        teamId: active.team_id,
        currentPrice: bidAmount,
        leaderId: p.id,
        leaderName: p.name,
        leaderColor: p.color,
        endTime: newEndTime,
        recentBids,
      });
    });

    socket.on('disconnect', () => {
      console.log(`[socket] ${p.name} disconnected`);
    });
  });

  // Restore active timer on server restart
  const tid = getActiveTournamentId();
  const active = db.prepare(
    "SELECT * FROM auction_items WHERE status = 'active' AND tournament_id = ?"
  ).get(tid);
  if (active && active.bid_end_time) {
    if (active.bid_end_time > Date.now()) {
      startTimer(active.id, active.bid_end_time);
    } else {
      setTimeout(() => closeAuction(active.id, io), 500);
    }
  }
}

module.exports = { setupSocket, startTimer, closeAuction };
