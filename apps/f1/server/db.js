const Database = require('better-sqlite3');
const path = require('path');

const { generateInviteCode } = require('./lib/core');
const { DRIVERS_2026 } = require('./data/drivers2026');
const { EVENTS_2026 } = require('./data/events2026');
const {
  EVENT_RULES,
  DEFAULT_SEASON_BONUS_RULES,
  DEPRECATED_SEASON_BONUS_CATEGORIES,
  PAYOUT_MODEL_V2,
} = require('./data/payoutRules');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'f1-calcutta.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function columnExists(tableName, columnName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return rows.some((row) => row.name === columnName);
}

function drawRandomPosition(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function applyPayoutModelV2Migration(seasonId) {
  const season = db.prepare('SELECT id, payout_model_version FROM seasons WHERE id = ?').get(seasonId);
  if (!season || (Number(season.payout_model_version) || 1) >= PAYOUT_MODEL_V2) {
    return { migrated: false };
  }

  const now = Date.now();

  const upsertEventRule = db.prepare(`
    INSERT INTO event_payout_rules
      (season_id, event_type, category, label, bps, rank_order, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(season_id, event_type, category, rank_order)
    DO UPDATE SET
      label = excluded.label,
      bps = excluded.bps,
      active = 1
  `);

  const upsertSeasonRule = db.prepare(`
    INSERT INTO season_bonus_rules
      (season_id, category, label, bps, rank_order, active)
    VALUES (?, ?, ?, ?, ?, 1)
    ON CONFLICT(season_id, category, rank_order)
    DO UPDATE SET
      label = excluded.label,
      bps = excluded.bps,
      active = 1
  `);

  const deactivateEventRule = db.prepare(`
    UPDATE event_payout_rules
    SET active = 0
    WHERE season_id = ? AND id = ?
  `);

  const deactivateSeasonRule = db.prepare(`
    UPDATE season_bonus_rules
    SET active = 0
    WHERE season_id = ? AND id = ?
  `);

  const updateGpRandomDraw = db.prepare(`
    UPDATE events
    SET random_bonus_position = ?, random_bonus_drawn_at = ?
    WHERE id = ? AND season_id = ?
  `);

  db.transaction(() => {
    for (const [eventType, rules] of Object.entries(EVENT_RULES)) {
      rules.forEach((rule) => {
        upsertEventRule.run(
          seasonId,
          eventType,
          rule.category,
          rule.label,
          rule.bps,
          rule.rank_order || 1
        );
      });

      const keepKeys = new Set(rules.map((rule) => `${rule.category}|${rule.rank_order || 1}`));
      const existing = db.prepare(`
        SELECT id, category, rank_order
        FROM event_payout_rules
        WHERE season_id = ? AND event_type = ?
      `).all(seasonId, eventType);

      existing.forEach((rule) => {
        const key = `${rule.category}|${rule.rank_order || 1}`;
        if (!keepKeys.has(key)) {
          deactivateEventRule.run(seasonId, rule.id);
        }
      });
    }

    DEFAULT_SEASON_BONUS_RULES.forEach((rule) => {
      upsertSeasonRule.run(
        seasonId,
        rule.category,
        rule.label,
        rule.bps,
        rule.rank_order || 1
      );
    });

    const keepSeasonKeys = new Set(DEFAULT_SEASON_BONUS_RULES.map((rule) => `${rule.category}|${rule.rank_order || 1}`));
    const existingSeasonRules = db.prepare(`
      SELECT id, category, rank_order
      FROM season_bonus_rules
      WHERE season_id = ?
    `).all(seasonId);

    existingSeasonRules.forEach((rule) => {
      const key = `${rule.category}|${rule.rank_order || 1}`;
      if (!keepSeasonKeys.has(key)) {
        deactivateSeasonRule.run(seasonId, rule.id);
      }
    });

    if (DEPRECATED_SEASON_BONUS_CATEGORIES.length) {
      const placeholders = DEPRECATED_SEASON_BONUS_CATEGORIES.map(() => '?').join(', ');
      db.prepare(`
        UPDATE season_bonus_rules
        SET active = 0
        WHERE season_id = ?
          AND category IN (${placeholders})
      `).run(seasonId, ...DEPRECATED_SEASON_BONUS_CATEGORIES);
    }

    const gpEvents = db.prepare(`
      SELECT id, random_bonus_position
      FROM events
      WHERE season_id = ? AND type = 'grand_prix' AND status = 'scored'
    `).all(seasonId);

    gpEvents.forEach((event) => {
      const pos = Number(event.random_bonus_position);
      if (!pos || pos < 4 || pos > 20) {
        updateGpRandomDraw.run(drawRandomPosition(4, 20), now, event.id, seasonId);
      }
    });

    db.prepare(`
      UPDATE seasons
      SET payout_model_version = ?
      WHERE id = ?
    `).run(PAYOUT_MODEL_V2, seasonId);
  })();

  return { migrated: true };
}

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS seasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      name TEXT NOT NULL,
      invite_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      auction_timer_seconds INTEGER NOT NULL DEFAULT 30,
      auction_grace_seconds INTEGER NOT NULL DEFAULT 15,
      auction_status TEXT NOT NULL DEFAULT 'waiting',
      auction_auto_advance INTEGER NOT NULL DEFAULT 0,
      payout_model_version INTEGER NOT NULL DEFAULT 1,
      season_random_bonus_position INTEGER,
      season_random_bonus_drawn_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      session_token TEXT UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS season_participants (
      season_id INTEGER NOT NULL REFERENCES seasons(id),
      participant_id INTEGER NOT NULL REFERENCES participants(id),
      joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (season_id, participant_id)
    );

    CREATE TABLE IF NOT EXISTS drivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL REFERENCES seasons(id),
      external_id INTEGER,
      code TEXT,
      name TEXT NOT NULL,
      team_name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      UNIQUE(season_id, external_id),
      UNIQUE(season_id, name)
    );

    CREATE TABLE IF NOT EXISTS auction_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL REFERENCES seasons(id),
      driver_id INTEGER NOT NULL REFERENCES drivers(id),
      status TEXT NOT NULL DEFAULT 'pending',
      current_price_cents INTEGER NOT NULL DEFAULT 0,
      current_leader_id INTEGER REFERENCES participants(id),
      bid_end_time INTEGER,
      final_price_cents INTEGER,
      winner_id INTEGER REFERENCES participants(id),
      queue_order INTEGER NOT NULL DEFAULT 9999,
      UNIQUE(season_id, driver_id)
    );

    CREATE TABLE IF NOT EXISTS bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL REFERENCES seasons(id),
      driver_id INTEGER NOT NULL REFERENCES drivers(id),
      participant_id INTEGER NOT NULL REFERENCES participants(id),
      amount_cents INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS ownership (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL REFERENCES seasons(id),
      driver_id INTEGER NOT NULL REFERENCES drivers(id),
      participant_id INTEGER NOT NULL REFERENCES participants(id),
      purchase_price_cents INTEGER NOT NULL,
      UNIQUE(season_id, driver_id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL REFERENCES seasons(id),
      external_event_id TEXT,
      round_number INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('grand_prix', 'sprint')),
      starts_at TEXT,
      lock_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      random_bonus_position INTEGER,
      random_bonus_drawn_at INTEGER,
      synced_at INTEGER,
      UNIQUE(season_id, round_number, type)
    );

    CREATE TABLE IF NOT EXISTS event_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id),
      driver_id INTEGER NOT NULL REFERENCES drivers(id),
      finish_position INTEGER NOT NULL,
      start_position INTEGER,
      positions_gained INTEGER,
      is_manual_override INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(event_id, driver_id)
    );

    CREATE TABLE IF NOT EXISTS event_payout_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL REFERENCES seasons(id),
      event_type TEXT NOT NULL CHECK(event_type IN ('grand_prix', 'sprint')),
      category TEXT NOT NULL,
      label TEXT NOT NULL,
      bps INTEGER NOT NULL,
      rank_order INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      UNIQUE(season_id, event_type, category, rank_order)
    );

    CREATE TABLE IF NOT EXISTS event_payouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL REFERENCES seasons(id),
      event_id INTEGER NOT NULL REFERENCES events(id),
      participant_id INTEGER NOT NULL REFERENCES participants(id),
      driver_id INTEGER REFERENCES drivers(id),
      category TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      tie_count INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS season_bonus_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL REFERENCES seasons(id),
      category TEXT NOT NULL,
      label TEXT NOT NULL,
      bps INTEGER NOT NULL,
      rank_order INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      UNIQUE(season_id, category, rank_order)
    );

    CREATE TABLE IF NOT EXISTS season_bonus_payouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL REFERENCES seasons(id),
      participant_id INTEGER NOT NULL REFERENCES participants(id),
      driver_id INTEGER REFERENCES drivers(id),
      category TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      tie_count INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  if (!columnExists('seasons', 'payout_model_version')) {
    db.exec('ALTER TABLE seasons ADD COLUMN payout_model_version INTEGER NOT NULL DEFAULT 1');
  }
  if (!columnExists('seasons', 'season_random_bonus_position')) {
    db.exec('ALTER TABLE seasons ADD COLUMN season_random_bonus_position INTEGER');
  }
  if (!columnExists('seasons', 'season_random_bonus_drawn_at')) {
    db.exec('ALTER TABLE seasons ADD COLUMN season_random_bonus_drawn_at INTEGER');
  }

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

  const activeSeasonId = getActiveSeasonId();
  seedSeasonData(activeSeasonId);
  const payoutMigration = applyPayoutModelV2Migration(activeSeasonId);
  return {
    activeSeasonId,
    payoutModelMigrated: !!payoutMigration.migrated,
  };
}

function seedSeasonData(seasonId) {
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

function getActiveSeasonId() {
  const value = db.prepare("SELECT value FROM settings WHERE key = 'active_season_id'").get()?.value;
  if (value) return parseInt(value, 10);
  const season = db.prepare('SELECT id FROM seasons ORDER BY id ASC LIMIT 1').get();
  return season?.id || 1;
}

function getActiveSeason() {
  return getSeason(getActiveSeasonId());
}

function getSeason(id) {
  return db.prepare('SELECT * FROM seasons WHERE id = ?').get(id);
}

function getParticipantByToken(token) {
  return db.prepare('SELECT * FROM participants WHERE session_token = ?').get(token);
}

function getSeasonParticipants(seasonId) {
  return db.prepare(`
    SELECT p.id, p.name, p.color, p.is_admin
    FROM participants p
    JOIN season_participants sp ON sp.participant_id = p.id
    WHERE sp.season_id = ?
    ORDER BY sp.joined_at ASC
  `).all(seasonId);
}

function getSeasonSettings(seasonId) {
  return db.prepare(`
    SELECT id, year, name, invite_code, status,
           auction_timer_seconds, auction_grace_seconds,
           auction_status, auction_auto_advance,
           payout_model_version,
           season_random_bonus_position,
           season_random_bonus_drawn_at
    FROM seasons
    WHERE id = ?
  `).get(seasonId);
}

function updateSeasonSettings(seasonId, patch) {
  const allowed = [
    'name',
    'invite_code',
    'auction_timer_seconds',
    'auction_grace_seconds',
    'auction_status',
    'auction_auto_advance',
    'status',
  ];

  const entries = Object.entries(patch || {}).filter(([k]) => allowed.includes(k));
  if (!entries.length) return;

  const sets = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = entries.map(([, v]) => v);
  db.prepare(`UPDATE seasons SET ${sets} WHERE id = ?`).run(...values, seasonId);
}

function getAuctionItems(seasonId) {
  return db.prepare(`
    SELECT ai.*, d.external_id as driver_external_id, d.code as driver_code,
           d.name as driver_name, d.team_name,
           p.name as leader_name, p.color as leader_color,
           w.name as winner_name, w.color as winner_color
    FROM auction_items ai
    JOIN drivers d ON d.id = ai.driver_id
    LEFT JOIN participants p ON p.id = ai.current_leader_id
    LEFT JOIN participants w ON w.id = ai.winner_id
    WHERE ai.season_id = ?
    ORDER BY ai.queue_order ASC
  `).all(seasonId);
}

function getActiveAuctionItem(seasonId) {
  return db.prepare(`
    SELECT ai.*, d.external_id as driver_external_id, d.code as driver_code,
           d.name as driver_name, d.team_name,
           p.name as leader_name, p.color as leader_color
    FROM auction_items ai
    JOIN drivers d ON d.id = ai.driver_id
    LEFT JOIN participants p ON p.id = ai.current_leader_id
    WHERE ai.season_id = ? AND ai.status = 'active'
    LIMIT 1
  `).get(seasonId);
}

function getRecentBids(driverId, seasonId, limit = 10) {
  return db.prepare(`
    SELECT b.*, p.name as participant_name, p.color
    FROM bids b
    JOIN participants p ON p.id = b.participant_id
    WHERE b.driver_id = ? AND b.season_id = ?
    ORDER BY b.created_at DESC, b.id DESC
    LIMIT ?
  `).all(driverId, seasonId, limit);
}

function getOwnership(seasonId) {
  return db.prepare(`
    SELECT o.*, d.code as driver_code, d.name as driver_name, d.team_name,
           p.name as owner_name, p.color as owner_color
    FROM ownership o
    JOIN drivers d ON d.id = o.driver_id
    JOIN participants p ON p.id = o.participant_id
    WHERE o.season_id = ?
    ORDER BY p.name ASC, d.name ASC
  `).all(seasonId);
}

function getTotalPotCents(seasonId) {
  return db.prepare(`
    SELECT COALESCE(SUM(purchase_price_cents), 0) as total
    FROM ownership
    WHERE season_id = ?
  `).get(seasonId).total;
}

function getAuctionCounts(seasonId) {
  return db.prepare(`
    SELECT
      COUNT(*) as total_count,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
      SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as sold_count
    FROM auction_items
    WHERE season_id = ?
  `).get(seasonId);
}

function getResolvedAuctionStatus(seasonId) {
  const configured = db.prepare('SELECT auction_status FROM seasons WHERE id = ?').get(seasonId)?.auction_status || 'waiting';
  const counts = getAuctionCounts(seasonId);
  if (
    counts.total_count > 0
    && counts.sold_count === counts.total_count
    && counts.pending_count === 0
    && counts.active_count === 0
  ) {
    return 'complete';
  }
  return configured;
}

function getStandings(seasonId) {
  return db.prepare(`
    SELECT
      p.id,
      p.name,
      p.color,
      COALESCE(o_agg.drivers_owned, 0) as drivers_owned,
      COALESCE(o_agg.total_spent_cents, 0) as total_spent_cents,
      COALESCE(e_agg.total_event_cents, 0) + COALESCE(sb_agg.total_bonus_cents, 0) as total_earned_cents
    FROM participants p
    JOIN season_participants sp ON sp.participant_id = p.id AND sp.season_id = ?
    LEFT JOIN (
      SELECT participant_id,
             COUNT(*) as drivers_owned,
             SUM(purchase_price_cents) as total_spent_cents
      FROM ownership
      WHERE season_id = ?
      GROUP BY participant_id
    ) o_agg ON o_agg.participant_id = p.id
    LEFT JOIN (
      SELECT participant_id, SUM(amount_cents) as total_event_cents
      FROM event_payouts
      WHERE season_id = ?
      GROUP BY participant_id
    ) e_agg ON e_agg.participant_id = p.id
    LEFT JOIN (
      SELECT participant_id, SUM(amount_cents) as total_bonus_cents
      FROM season_bonus_payouts
      WHERE season_id = ?
      GROUP BY participant_id
    ) sb_agg ON sb_agg.participant_id = p.id
    WHERE p.is_admin = 0
    ORDER BY total_earned_cents DESC, total_spent_cents ASC, p.name ASC
  `).all(seasonId, seasonId, seasonId, seasonId);
}

function getParticipantPortfolio(seasonId, participantId) {
  return db.prepare(`
    SELECT o.purchase_price_cents,
           d.id as driver_id,
           d.external_id as driver_external_id,
           d.code as driver_code,
           d.name as driver_name,
           d.team_name,
           COALESCE(ep.event_earnings_cents, 0) as event_earnings_cents,
           COALESCE(sb.bonus_earnings_cents, 0) as bonus_earnings_cents
    FROM ownership o
    JOIN drivers d ON d.id = o.driver_id
    LEFT JOIN (
      SELECT driver_id, participant_id, SUM(amount_cents) as event_earnings_cents
      FROM event_payouts
      WHERE season_id = ?
      GROUP BY driver_id, participant_id
    ) ep ON ep.driver_id = o.driver_id AND ep.participant_id = o.participant_id
    LEFT JOIN (
      SELECT driver_id, participant_id, SUM(amount_cents) as bonus_earnings_cents
      FROM season_bonus_payouts
      WHERE season_id = ?
      GROUP BY driver_id, participant_id
    ) sb ON sb.driver_id = o.driver_id AND sb.participant_id = o.participant_id
    WHERE o.season_id = ? AND o.participant_id = ?
    ORDER BY d.name ASC
  `).all(seasonId, seasonId, seasonId, participantId);
}

function getEvents(seasonId) {
  return db.prepare(`
    SELECT e.*,
           COALESCE(p.total_payout_cents, 0) as total_payout_cents,
           COALESCE(r.result_count, 0) as result_count
    FROM events e
    LEFT JOIN (
      SELECT event_id, SUM(amount_cents) as total_payout_cents
      FROM event_payouts
      WHERE season_id = ?
      GROUP BY event_id
    ) p ON p.event_id = e.id
    LEFT JOIN (
      SELECT event_id, COUNT(*) as result_count
      FROM event_results
      GROUP BY event_id
    ) r ON r.event_id = e.id
    WHERE e.season_id = ?
    ORDER BY e.round_number ASC,
      CASE WHEN e.type = 'sprint' THEN 0 ELSE 1 END ASC
  `).all(seasonId, seasonId);
}

function getEventById(seasonId, eventId) {
  return db.prepare('SELECT * FROM events WHERE season_id = ? AND id = ?').get(seasonId, eventId);
}

function getEventResults(eventId) {
  return db.prepare(`
    SELECT er.*, d.external_id as driver_external_id, d.code as driver_code,
           d.name as driver_name, d.team_name
    FROM event_results er
    JOIN drivers d ON d.id = er.driver_id
    WHERE er.event_id = ?
    ORDER BY er.finish_position ASC
  `).all(eventId);
}

function getEventPayoutRules(seasonId, eventType) {
  return db.prepare(`
    SELECT *
    FROM event_payout_rules
    WHERE season_id = ? AND event_type = ? AND active = 1
    ORDER BY bps DESC, rank_order ASC, category ASC
  `).all(seasonId, eventType);
}

function getSeasonBonusRules(seasonId) {
  return db.prepare(`
    SELECT *
    FROM season_bonus_rules
    WHERE season_id = ? AND active = 1
    ORDER BY rank_order ASC, category ASC
  `).all(seasonId);
}

function getEventPayouts(seasonId, eventId) {
  return db.prepare(`
    SELECT ep.*, p.name as participant_name, p.color as participant_color,
           d.code as driver_code, d.name as driver_name
    FROM event_payouts ep
    JOIN participants p ON p.id = ep.participant_id
    LEFT JOIN drivers d ON d.id = ep.driver_id
    WHERE ep.season_id = ? AND ep.event_id = ?
    ORDER BY ep.amount_cents DESC, p.name ASC
  `).all(seasonId, eventId);
}

function getOwnershipBySeason(seasonId) {
  return db.prepare(`
    SELECT driver_id, participant_id
    FROM ownership
    WHERE season_id = ?
  `).all(seasonId);
}

module.exports = {
  db,
  init,
  getActiveSeasonId,
  getActiveSeason,
  getSeason,
  getParticipantByToken,
  getSeasonParticipants,
  getSeasonSettings,
  updateSeasonSettings,
  getAuctionItems,
  getActiveAuctionItem,
  getRecentBids,
  getOwnership,
  getOwnershipBySeason,
  getTotalPotCents,
  getAuctionCounts,
  getResolvedAuctionStatus,
  getStandings,
  getParticipantPortfolio,
  getEvents,
  getEventById,
  getEventResults,
  getEventPayoutRules,
  getSeasonBonusRules,
  getEventPayouts,
};
