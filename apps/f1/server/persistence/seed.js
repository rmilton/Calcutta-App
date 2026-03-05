const { generateInviteCode } = require('../lib/core');
const { DRIVERS_2026 } = require('../data/drivers2026');
const { EVENTS_2026 } = require('../data/events2026');
const { EVENT_RULES, DEFAULT_SEASON_BONUS_RULES } = require('../data/payoutRules');
const seasonRepo = require('./repositories/seasonRepo');

function ensureActiveSeason(db) {
  const seasonCount = db.prepare('SELECT COUNT(*) as c FROM seasons').get().c;
  if (seasonCount === 0) {
    const year = new Date().getUTCFullYear();
    const seasonId = db.prepare(`
      INSERT INTO seasons (year, name, invite_code)
      VALUES (?, ?, ?)
    `).run(year, `F1 Calcutta ${year}`, generateInviteCode()).lastInsertRowid;

    db.prepare(`
      INSERT OR REPLACE INTO settings (key, value) VALUES ('active_season_id', ?)
    `).run(String(seasonId));
  }

  return seasonRepo.getActiveSeasonId(db);
}

function seedSeasonData(db, seasonId) {
  const insertDriver = db.prepare(`
    INSERT OR IGNORE INTO drivers (season_id, external_id, code, name, team_name, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  const insertAuctionItem = db.prepare(`
    INSERT OR IGNORE INTO auction_items (season_id, driver_id, queue_order)
    VALUES (?, ?, ?)
  `);
  const insertEvent = db.prepare(`
    INSERT INTO events
      (season_id, external_event_id, round_number, name, type, starts_at, lock_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(season_id, round_number, type) DO UPDATE SET
      external_event_id = excluded.external_event_id,
      name = excluded.name,
      starts_at = excluded.starts_at,
      lock_at = excluded.lock_at
  `);
  const insertEventRule = db.prepare(`
    INSERT OR IGNORE INTO event_payout_rules
      (season_id, event_type, category, label, bps, rank_order, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  const insertSeasonBonusRule = db.prepare(`
    INSERT OR IGNORE INTO season_bonus_rules
      (season_id, category, label, bps, rank_order, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  db.transaction(() => {
    DRIVERS_2026.forEach((driver) => {
      insertDriver.run(seasonId, driver.external_id, driver.code, driver.name, driver.team_name);
    });

    const seededDrivers = db.prepare(`
      SELECT id, external_id
      FROM drivers
      WHERE season_id = ?
      ORDER BY external_id ASC
    `).all(seasonId);

    seededDrivers.forEach((driver, idx) => {
      insertAuctionItem.run(seasonId, driver.id, idx);
    });

    EVENTS_2026.forEach((event) => {
      insertEvent.run(
        seasonId,
        `mock-${event.round_number}`,
        event.round_number,
        event.name,
        event.type,
        event.starts_at,
        event.lock_at
      );
    });

    Object.entries(EVENT_RULES).forEach(([eventType, rules]) => {
      rules.forEach((rule) => {
        insertEventRule.run(seasonId, eventType, rule.category, rule.label, rule.bps, rule.rank_order || 1);
      });
    });

    DEFAULT_SEASON_BONUS_RULES.forEach((rule) => {
      insertSeasonBonusRule.run(seasonId, rule.category, rule.label, rule.bps, rule.rank_order);
    });
  })();
}

module.exports = {
  ensureActiveSeason,
  seedSeasonData,
};
