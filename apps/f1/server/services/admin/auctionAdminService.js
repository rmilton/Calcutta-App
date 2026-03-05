const { generateInviteCode } = require('../../lib/core');
const {
  db,
  getSeasonSettings,
  updateSeasonSettings,
  getSeasonParticipants,
  getAuctionItems,
} = require('../../db');

function getSettings({ seasonId }) {
  return getSeasonSettings(seasonId);
}

function updateSettingsForSeason({ seasonId, patch, io }) {
  updateSeasonSettings(seasonId, patch || {});
  const settings = getSeasonSettings(seasonId);
  io?.emit('auction:status', { status: settings.auction_status });
  return { ok: true, settings };
}

function regenerateInviteCode({ seasonId }) {
  const code = generateInviteCode();
  updateSeasonSettings(seasonId, { invite_code: code });
  return { ok: true, invite_code: code };
}

function listParticipants({ seasonId }) {
  return getSeasonParticipants(seasonId);
}

function removeParticipant({ seasonId, participantId }) {
  db.prepare(`
    DELETE FROM season_participants
    WHERE season_id = ?
      AND participant_id = ?
      AND participant_id IN (SELECT id FROM participants WHERE is_admin = 0)
  `).run(seasonId, participantId);
  return { ok: true };
}

function listAuctionQueue({ seasonId }) {
  return getAuctionItems(seasonId);
}

function updateAuctionQueue({ seasonId, order }) {
  if (!Array.isArray(order)) return { ok: false, status: 400, error: 'order must be an array' };

  const update = db.prepare(`
    UPDATE auction_items
    SET queue_order = ?
    WHERE id = ? AND status = 'pending' AND season_id = ?
  `);

  db.transaction(() => {
    order.forEach((item) => update.run(item.queue_order, item.id, seasonId));
  })();

  return { ok: true };
}

function setAuctionStatus({ seasonId, status, io }) {
  updateSeasonSettings(seasonId, { auction_status: status });
  io?.emit('auction:status', { status });
  return { ok: true };
}

function startNextAuction({ seasonId, auctionService, driverId }) {
  return auctionService.startAuction({ seasonId, driverId });
}

function closeActiveAuction({ seasonId, auctionService }) {
  return auctionService.closeActiveAuction({ seasonId });
}

module.exports = {
  getSettings,
  updateSettingsForSeason,
  regenerateInviteCode,
  listParticipants,
  removeParticipant,
  listAuctionQueue,
  updateAuctionQueue,
  setAuctionStatus,
  startNextAuction,
  closeActiveAuction,
};
