const {
  computeBidEndTime,
  extendBidEndTime,
} = require('../lib/core');
const {
  db,
  getActiveSeasonId,
  getSeasonSettings,
  updateSeasonSettings,
  getActiveAuctionItem,
  getAuctionItems,
  getRecentBids,
  getAuctionCounts,
  getResolvedAuctionStatus,
} = require('../db');

function createAuctionService(io, options = {}) {
  const autoAdvanceDelayMs = options.autoAdvanceDelayMs ?? 2500;
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;

  let activeTimer = null;
  let activeAuctionItemId = null;

  function clearActiveTimer() {
    if (activeTimer) {
      clearTimeoutFn(activeTimer);
      activeTimer = null;
    }
    activeAuctionItemId = null;
  }

  function startTimer(itemId, endTime) {
    clearActiveTimer();
    const delay = endTime - Date.now();
    if (delay <= 0) return;
    activeAuctionItemId = itemId;
    activeTimer = setTimeoutFn(() => {
      try {
        closeAuction(itemId);
      } catch (error) {
        console.error('[auction close timer]', error);
      }
    }, delay);
  }

  function startAuction({ seasonId, driverId } = {}) {
    const sid = seasonId ?? getActiveSeasonId();
    const settings = getSeasonSettings(sid);

    const currentlyActive = getActiveAuctionItem(sid);
    if (currentlyActive) {
      return { ok: false, status: 400, error: 'An auction is already active.' };
    }

    let item;
    if (driverId) {
      item = db.prepare(`
        SELECT *
        FROM auction_items
        WHERE season_id = ? AND driver_id = ? AND status = 'pending'
      `).get(sid, driverId);
    } else {
      item = db.prepare(`
        SELECT *
        FROM auction_items
        WHERE season_id = ? AND status = 'pending'
        ORDER BY queue_order ASC
        LIMIT 1
      `).get(sid);
    }

    if (!item) return { ok: false, status: 404, error: 'No pending drivers' };

    const endTime = computeBidEndTime({
      nowMs: Date.now(),
      timerSeconds: settings.auction_timer_seconds,
    });

    db.prepare(`
      UPDATE auction_items
      SET status = 'active',
          bid_end_time = ?,
          current_price_cents = 0,
          current_leader_id = NULL
      WHERE id = ?
    `).run(endTime, item.id);

    startTimer(item.id, endTime);

    const refreshed = getActiveAuctionItem(sid);
    io.emit('auction:started', {
      itemId: refreshed.id,
      driverId: refreshed.driver_id,
      endTime: refreshed.bid_end_time,
      driverName: refreshed.driver_name,
      driverCode: refreshed.driver_code,
      teamName: refreshed.team_name,
    });

    return { ok: true, itemId: item.id };
  }

  function closeAuction(itemId) {
    clearActiveTimer();
    const sid = getActiveSeasonId();

    const item = db.prepare(`
      SELECT * FROM auction_items
      WHERE id = ? AND season_id = ? AND status = 'active'
    `).get(itemId, sid);

    if (!item) return { ok: false, status: 404, error: 'No active auction item found' };

    if (item.current_leader_id && item.current_price_cents > 0) {
      db.transaction(() => {
        db.prepare(`
          UPDATE auction_items
          SET status = 'sold', winner_id = ?, final_price_cents = ?, bid_end_time = NULL
          WHERE id = ?
        `).run(item.current_leader_id, item.current_price_cents, item.id);

        db.prepare(`
          INSERT OR REPLACE INTO ownership
            (season_id, driver_id, participant_id, purchase_price_cents)
          VALUES (?, ?, ?, ?)
        `).run(sid, item.driver_id, item.current_leader_id, item.current_price_cents);
      })();

      const winner = db.prepare('SELECT name, color FROM participants WHERE id = ?').get(item.current_leader_id);
      const driver = db.prepare('SELECT name, code, team_name FROM drivers WHERE id = ?').get(item.driver_id);

      io.emit('auction:sold', {
        itemId: item.id,
        driverId: item.driver_id,
        driverName: driver?.name,
        driverCode: driver?.code,
        teamName: driver?.team_name,
        winnerId: item.current_leader_id,
        winnerName: winner?.name,
        winnerColor: winner?.color,
        finalPriceCents: item.current_price_cents,
      });
    } else {
      db.prepare(`
        UPDATE auction_items
        SET status = 'pending',
            bid_end_time = NULL,
            current_price_cents = 0,
            current_leader_id = NULL
        WHERE id = ?
      `).run(item.id);
      io.emit('auction:nobids', { itemId: item.id, driverId: item.driver_id });
    }

    const counts = getAuctionCounts(sid);
    if (
      counts.total_count > 0
      && counts.sold_count === counts.total_count
      && counts.pending_count === 0
      && counts.active_count === 0
    ) {
      updateSeasonSettings(sid, { auction_status: 'complete' });
      io.emit('auction:status', { status: 'complete' });
      io.emit('auction:complete');
    } else if (String(getSeasonSettings(sid).auction_auto_advance) === '1') {
      setTimeoutFn(() => {
        if (getSeasonSettings(sid).auction_status !== 'open') return;
        startAuction({ seasonId: sid });
      }, autoAdvanceDelayMs);
    }

    return { ok: true };
  }

  function closeActiveAuction({ seasonId } = {}) {
    const sid = seasonId ?? getActiveSeasonId();
    const active = getActiveAuctionItem(sid);
    if (!active) return { ok: false, status: 400, error: 'No active auction' };
    return closeAuction(active.id);
  }

  function placeBid({ participant, amountCents }) {
    if (!participant || participant.is_admin) {
      return { ok: false, status: 403, error: 'Admin cannot bid' };
    }

    const bidAmount = parseInt(amountCents, 10);
    if (!Number.isFinite(bidAmount) || bidAmount <= 0) {
      return { ok: false, status: 400, error: 'Invalid bid amount' };
    }

    const sid = getActiveSeasonId();
    const settings = getSeasonSettings(sid);
    const active = getActiveAuctionItem(sid);
    if (!active) return { ok: false, status: 400, error: 'No active auction' };

    if (settings.auction_status === 'paused') {
      return { ok: false, status: 400, error: 'Auction is paused' };
    }

    if (active.current_leader_id === participant.id) {
      return { ok: false, status: 400, error: 'You already have the high bid' };
    }

    if (bidAmount <= active.current_price_cents) {
      return { ok: false, status: 400, error: 'Bid must be higher than current price' };
    }

    const newEndTime = extendBidEndTime({
      nowMs: Date.now(),
      existingEndTime: active.bid_end_time,
      graceSeconds: settings.auction_grace_seconds,
    });

    db.transaction(() => {
      db.prepare(`
        INSERT INTO bids (season_id, driver_id, participant_id, amount_cents)
        VALUES (?, ?, ?, ?)
      `).run(sid, active.driver_id, participant.id, bidAmount);

      db.prepare(`
        UPDATE auction_items
        SET current_price_cents = ?, current_leader_id = ?, bid_end_time = ?
        WHERE id = ?
      `).run(bidAmount, participant.id, newEndTime, active.id);
    })();

    startTimer(active.id, newEndTime);

    io.emit('auction:update', {
      itemId: active.id,
      driverId: active.driver_id,
      currentPriceCents: bidAmount,
      leaderId: participant.id,
      leaderName: participant.name,
      leaderColor: participant.color,
      endTime: newEndTime,
      recentBids: getRecentBids(active.driver_id, sid),
    });

    return { ok: true };
  }

  function emitAuctionState(socket, seasonId) {
    const sid = seasonId ?? getActiveSeasonId();
    const active = getActiveAuctionItem(sid);
    const auctionStatus = getResolvedAuctionStatus(sid);
    socket.emit('auction:state', {
      auctionStatus,
      active,
      recentBids: active ? getRecentBids(active.driver_id, sid) : [],
      items: getAuctionItems(sid),
    });
  }

  function restoreTimerOnStartup() {
    const sid = getActiveSeasonId();
    const active = getActiveAuctionItem(sid);
    if (!active?.bid_end_time) return;
    if (active.bid_end_time > Date.now()) {
      startTimer(active.id, active.bid_end_time);
    } else {
      setTimeoutFn(() => closeAuction(active.id), 500);
    }
  }

  return {
    startAuction,
    closeAuction,
    closeActiveAuction,
    clearActiveTimer,
    placeBid,
    emitAuctionState,
    restoreTimerOnStartup,
    activeItemId: () => activeAuctionItemId,
  };
}

module.exports = { createAuctionService };
