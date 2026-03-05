function columnExists(db, tableName, columnName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return rows.some((row) => row.name === columnName);
}

function ensureSchema(db) {
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

    CREATE TABLE IF NOT EXISTS provider_sync_state (
      season_id INTEGER NOT NULL REFERENCES seasons(id),
      scope TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      meta_json TEXT,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (season_id, scope)
    );
  `);

  if (!columnExists(db, 'seasons', 'payout_model_version')) {
    db.exec('ALTER TABLE seasons ADD COLUMN payout_model_version INTEGER NOT NULL DEFAULT 1');
  }
  if (!columnExists(db, 'seasons', 'season_random_bonus_position')) {
    db.exec('ALTER TABLE seasons ADD COLUMN season_random_bonus_position INTEGER');
  }
  if (!columnExists(db, 'seasons', 'season_random_bonus_drawn_at')) {
    db.exec('ALTER TABLE seasons ADD COLUMN season_random_bonus_drawn_at INTEGER');
  }
}

module.exports = {
  ensureSchema,
};
