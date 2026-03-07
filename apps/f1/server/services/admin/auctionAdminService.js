const { generateInviteCode } = require('../../lib/core');
const {
  db,
  getSeasonSettings,
  updateSeasonSettings,
  getSeasonParticipants,
  getAuctionItems,
  getOwnership,
} = require('../../db');
const { shuffleArray } = require('../../lib/shuffle');

function csvCell(value) {
  if (value == null) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function formatCurrency(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

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

function shufflePendingAuctionQueue({ seasonId, shuffle = shuffleArray }) {
  const pendingItems = db.prepare(`
    SELECT id
    FROM auction_items
    WHERE season_id = ? AND status = 'pending'
    ORDER BY queue_order ASC, id ASC
  `).all(seasonId);

  const update = db.prepare(`
    UPDATE auction_items
    SET queue_order = ?
    WHERE id = ? AND season_id = ? AND status = 'pending'
  `);

  const shuffled = shuffle(pendingItems);
  db.transaction(() => {
    shuffled.forEach((item, idx) => update.run(idx, item.id, seasonId));
  })();

  return {
    ok: true,
    shuffledCount: shuffled.length,
    message: shuffled.length
      ? `Shuffled ${shuffled.length} pending drivers.`
      : 'No pending drivers to shuffle.',
  };
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

function buildAuctionResultsCsv({ seasonId }) {
  const participants = getSeasonParticipants(seasonId)
    .filter((participant) => !participant.is_admin);
  const ownership = getOwnership(seasonId);

  const totalsByParticipantId = ownership.reduce((acc, row) => {
    const existing = acc.get(row.participant_id) || {
      driverCount: 0,
      spendCents: 0,
    };
    existing.driverCount += 1;
    existing.spendCents += Number(row.purchase_price_cents || 0);
    acc.set(row.participant_id, existing);
    return acc;
  }, new Map());

  const rows = [[
    'participant_name',
    'participant_color',
    'participant_driver_count',
    'participant_total_spend_cents',
    'participant_total_spend_usd',
    'driver_name',
    'driver_code',
    'team_name',
    'purchase_price_cents',
    'purchase_price_usd',
  ]];

  participants.forEach((participant) => {
    const participantRows = ownership.filter((row) => row.participant_id === participant.id);
    const totals = totalsByParticipantId.get(participant.id) || {
      driverCount: 0,
      spendCents: 0,
    };

    if (!participantRows.length) {
      rows.push([
        participant.name,
        participant.color,
        totals.driverCount,
        totals.spendCents,
        formatCurrency(totals.spendCents),
        '',
        '',
        '',
        '',
        '',
      ]);
      return;
    }

    participantRows.forEach((row) => {
      rows.push([
        participant.name,
        participant.color,
        totals.driverCount,
        totals.spendCents,
        formatCurrency(totals.spendCents),
        row.driver_name,
        row.driver_code,
        row.team_name,
        row.purchase_price_cents,
        formatCurrency(row.purchase_price_cents),
      ]);
    });
  });

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

module.exports = {
  getSettings,
  updateSettingsForSeason,
  regenerateInviteCode,
  listParticipants,
  removeParticipant,
  listAuctionQueue,
  updateAuctionQueue,
  shufflePendingAuctionQueue,
  setAuctionStatus,
  startNextAuction,
  closeActiveAuction,
  buildAuctionResultsCsv,
};
