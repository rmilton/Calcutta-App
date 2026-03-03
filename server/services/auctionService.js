const {
  db,
  getActiveTournamentId,
  getTournamentSetting,
  getActiveAuctionItem,
  getRecentBids,
  getTotalPot,
} = require('../db');
const { generateAuctionCommentary } = require('../ai');

function createAuctionService(io, options = {}) {
  const autoAdvanceDelayMs = options.autoAdvanceDelayMs ?? 3000;
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
  let activeTimer = null;
  let activeItemId = null;

  function clearActiveTimer() {
    if (activeTimer) {
      clearTimeoutFn(activeTimer);
      activeTimer = null;
    }
    activeItemId = null;
  }

  function startTimer(itemId, endTime) {
    clearActiveTimer();
    activeItemId = itemId;
    const delay = endTime - Date.now();
    if (delay <= 0) return;
    activeTimer = setTimeoutFn(() => {
      try {
        closeAuction(itemId);
      } catch (e) {
        console.error('[closeAuction timer]', e);
      }
    }, delay);
  }

  function generateSaleCommentary(item, winner, team, tid) {
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

  function checkAuctionCompletion(tid) {
    const pending = db.prepare(
      "SELECT COUNT(*) as c FROM auction_items WHERE status IN ('pending', 'active') AND tournament_id = ?"
    ).get(tid).c;
    if (pending === 0) io.emit('auction:complete');
  }

  function startAuction({ tid, teamId } = {}) {
    const tournamentId = tid ?? getActiveTournamentId();
    const currentActive = getActiveAuctionItem(tournamentId);
    if (currentActive) {
      return { ok: false, status: 400, error: 'An auction is already active. Close it first.' };
    }

    let item;
    if (teamId) {
      item = db.prepare(
        "SELECT * FROM auction_items WHERE team_id = ? AND status = 'pending' AND tournament_id = ?"
      ).get(teamId, tournamentId);
    } else {
      item = db.prepare(
        "SELECT * FROM auction_items WHERE status = 'pending' AND tournament_id = ? ORDER BY queue_order LIMIT 1"
      ).get(tournamentId);
    }
    if (!item) return { ok: false, status: 404, error: 'No pending teams' };

    const timerSeconds = parseInt(getTournamentSetting(tournamentId, 'auction_timer_seconds') || '30', 10);
    const endTime = Date.now() + timerSeconds * 1000;

    db.prepare(
      "UPDATE auction_items SET status = 'active', bid_end_time = ?, current_price = 0 WHERE id = ?"
    ).run(endTime, item.id);

    startTimer(item.id, endTime);
    io.emit('auction:started', { itemId: item.id, teamId: item.team_id, endTime });
    return { ok: true, itemId: item.id, teamId: item.team_id, endTime };
  }

  function autoAdvanceToNextItem(tid) {
    if (getTournamentSetting(tid, 'auction_auto_advance') !== '1') return;

    setTimeoutFn(() => {
      const activeTid = getActiveTournamentId();
      if (getTournamentSetting(activeTid, 'auction_status') !== 'open') return;
      startAuction({ tid: activeTid });
    }, autoAdvanceDelayMs);
  }

  function closeAuction(itemId) {
    clearActiveTimer();

    const tid = getActiveTournamentId();
    const item = db.prepare(
      "SELECT * FROM auction_items WHERE id = ? AND status = 'active' AND tournament_id = ?"
    ).get(itemId, tid);
    if (!item) return { ok: false, status: 404, error: 'No active auction' };

    if (item.current_leader_id && item.current_price > 0) {
      db.transaction(() => {
        db.prepare("UPDATE auction_items SET status = 'sold', winner_id = ?, final_price = ? WHERE id = ?")
          .run(item.current_leader_id, item.current_price, item.id);
        db.prepare(
          'INSERT OR REPLACE INTO ownership (tournament_id, team_id, participant_id, purchase_price) VALUES (?, ?, ?, ?)'
        ).run(tid, item.team_id, item.current_leader_id, item.current_price);
      })();

      const winner = db.prepare('SELECT name, color FROM participants WHERE id = ?').get(item.current_leader_id);
      const team = db.prepare('SELECT name, seed, region FROM teams WHERE id = ?').get(item.team_id);
      const aiCommentaryEnabled = getTournamentSetting(tid, 'ai_commentary_enabled') !== '0'
        && !!process.env.ANTHROPIC_API_KEY;

      io.emit('auction:sold', {
        itemId,
        teamId: item.team_id,
        teamName: team?.name,
        winnerId: item.current_leader_id,
        winnerName: winner?.name,
        winnerColor: winner?.color,
        finalPrice: item.current_price,
        aiCommentaryEnabled,
      });

      if (aiCommentaryEnabled) {
        generateSaleCommentary(item, winner, team, tid);
      }
      autoAdvanceToNextItem(tid);
    } else {
      db.prepare(
        "UPDATE auction_items SET status = 'pending', bid_end_time = NULL, current_price = 0, current_leader_id = NULL WHERE id = ?"
      ).run(itemId);
      io.emit('auction:nobids', { itemId });
    }

    checkAuctionCompletion(tid);
    return { ok: true, itemId };
  }

  function closeActiveAuction({ tid } = {}) {
    const tournamentId = tid ?? getActiveTournamentId();
    const active = getActiveAuctionItem(tournamentId);
    if (!active) return { ok: false, status: 400, error: 'No active auction' };
    return closeAuction(active.id);
  }

  function emitAuctionState(socket, tid) {
    const tournamentId = tid ?? getActiveTournamentId();
    const active = getActiveAuctionItem(tournamentId);
    const auctionStatus = getTournamentSetting(tournamentId, 'auction_status');
    const rawScheduled = getTournamentSetting(tournamentId, 'auction_scheduled_start');
    const scheduledStart = rawScheduled ? parseInt(rawScheduled, 10) : null;

    if (active) {
      const recentBids = getRecentBids(active.team_id);
      socket.emit('auction:state', {
        active,
        recentBids,
        auctionStatus,
        scheduledStart,
      });
      return;
    }

    socket.emit('auction:state', {
      active: null,
      recentBids: [],
      auctionStatus,
      scheduledStart,
    });
  }

  function placeBid({ participant, amount }) {
    if (participant?.is_admin) {
      return { ok: false, status: 403, error: 'Admin cannot place bids' };
    }
    if (!amount || Number.isNaN(Number(amount))) {
      return { ok: false, status: 400, error: 'Invalid bid amount' };
    }

    const bidAmount = parseFloat(parseFloat(amount).toFixed(2));
    const tid = getActiveTournamentId();
    const active = getActiveAuctionItem(tid);

    if (!active) return { ok: false, status: 400, error: 'No active auction' };
    if (bidAmount <= active.current_price) {
      return { ok: false, status: 400, error: `Bid must be greater than $${active.current_price}` };
    }
    if (active.current_leader_id === participant.id) {
      return { ok: false, status: 400, error: 'You already have the highest bid' };
    }

    const auctionStatus = getTournamentSetting(tid, 'auction_status');
    if (auctionStatus === 'paused') {
      return { ok: false, status: 400, error: 'Auction is paused' };
    }

    const graceSeconds = parseInt(getTournamentSetting(tid, 'auction_grace_seconds') || '15', 10);
    const newEndTime = Math.max(Date.now() + graceSeconds * 1000, active.bid_end_time);

    db.transaction(() => {
      db.prepare('INSERT INTO bids (team_id, participant_id, amount, tournament_id) VALUES (?, ?, ?, ?)')
        .run(active.team_id, participant.id, bidAmount, tid);
      db.prepare('UPDATE auction_items SET current_price = ?, current_leader_id = ?, bid_end_time = ? WHERE id = ?')
        .run(bidAmount, participant.id, newEndTime, active.id);
    })();

    startTimer(active.id, newEndTime);

    const recentBids = getRecentBids(active.team_id);
    io.emit('auction:update', {
      itemId: active.id,
      teamId: active.team_id,
      currentPrice: bidAmount,
      leaderId: participant.id,
      leaderName: participant.name,
      leaderColor: participant.color,
      endTime: newEndTime,
      recentBids,
    });

    return { ok: true };
  }

  function restoreTimerOnStartup() {
    const tid = getActiveTournamentId();
    const active = db.prepare(
      "SELECT * FROM auction_items WHERE status = 'active' AND tournament_id = ?"
    ).get(tid);
    if (!active?.bid_end_time) return;

    if (active.bid_end_time > Date.now()) {
      startTimer(active.id, active.bid_end_time);
    } else {
      setTimeoutFn(() => closeAuction(active.id), 500);
    }
  }

  return {
    activeItemId: () => activeItemId,
    startTimer,
    startAuction,
    closeAuction,
    closeActiveAuction,
    placeBid,
    emitAuctionState,
    restoreTimerOnStartup,
  };
}

module.exports = { createAuctionService };
