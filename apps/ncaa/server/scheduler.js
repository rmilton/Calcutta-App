const { getActiveTournamentId, getTournamentSetting, setTournamentSetting } = require('./db');

let scheduledTimer = null;

function clearScheduledStart() {
  if (scheduledTimer) { clearTimeout(scheduledTimer); scheduledTimer = null; }
}

// ts = Unix ms. io = socket.io server instance.
function scheduleAuctionStart(tid, ts, io) {
  clearScheduledStart();
  const delay = ts - Date.now();
  if (delay <= 0) return;
  scheduledTimer = setTimeout(() => {
    scheduledTimer = null;
    const status = getTournamentSetting(tid, 'auction_status');
    if (status !== 'waiting') return; // already opened manually
    setTournamentSetting(tid, 'auction_status', 'open');
    setTournamentSetting(tid, 'auction_scheduled_start', '');
    io.emit('auction:status', { status: 'open' });
    io.emit('auction:scheduled_start', { ts: null }); // tell clients schedule is cleared
  }, delay);
}

// Called once at server startup to restore any pending schedule from DB.
function initScheduler(io) {
  const tid = getActiveTournamentId();
  if (!tid) return;
  const val = getTournamentSetting(tid, 'auction_scheduled_start');
  if (!val || val === '' || val === 'null') return;
  const ts = parseInt(val);
  const status = getTournamentSetting(tid, 'auction_status');
  if (!isNaN(ts) && ts > Date.now() && status === 'waiting') {
    scheduleAuctionStart(tid, ts, io);
  }
}

module.exports = { scheduleAuctionStart, clearScheduledStart, initScheduler };
