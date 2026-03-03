const Database = require('better-sqlite3');
const path = require('path');
const { TEAMS_2025 } = require('./data/teams2025');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'calcutta.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Keys that live on the tournaments row (not the settings table)
const TOURNAMENT_SETTING_KEYS = [
  'name', 'invite_code', 'auction_timer_seconds', 'auction_grace_seconds',
  'auction_status', 'tournament_started', 'auction_order', 'auction_auto_advance',
  'ai_commentary_enabled', 'auction_scheduled_start', 'ai_commentary_end_of_round',
];

// Payout round defaults (shared between init and createTournament)
const PAYOUT_DEFAULTS = [
  [1, 'Round of 64',  0, 'fixed'],
  [2, 'Round of 32',  0, 'fixed'],
  [3, 'Sweet 16',     0, 'fixed'],
  [4, 'Elite 8',      0, 'fixed'],
  [5, 'Final Four',   0, 'fixed'],
  [6, 'Championship', 0, 'fixed'],
];

function init() {
  // ── Base tables ──────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#6366f1',
      is_admin INTEGER NOT NULL DEFAULT 0,
      session_token TEXT UNIQUE,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      seed INTEGER NOT NULL,
      region TEXT NOT NULL,
      eliminated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS auction_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL REFERENCES teams(id),
      status TEXT NOT NULL DEFAULT 'pending',
      current_price REAL NOT NULL DEFAULT 0,
      current_leader_id INTEGER REFERENCES participants(id),
      bid_end_time INTEGER,
      final_price REAL,
      winner_id INTEGER REFERENCES participants(id),
      queue_order INTEGER NOT NULL DEFAULT 9999
    );

    CREATE TABLE IF NOT EXISTS bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL REFERENCES teams(id),
      participant_id INTEGER NOT NULL REFERENCES participants(id),
      amount REAL NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS ownership (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL UNIQUE REFERENCES teams(id),
      participant_id INTEGER NOT NULL REFERENCES participants(id),
      purchase_price REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round INTEGER NOT NULL,
      region TEXT NOT NULL,
      position INTEGER NOT NULL,
      team1_id INTEGER REFERENCES teams(id),
      team2_id INTEGER REFERENCES teams(id),
      winner_id INTEGER REFERENCES teams(id),
      played_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS payout_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_number INTEGER NOT NULL UNIQUE,
      round_name TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      payout_type TEXT NOT NULL DEFAULT 'fixed'
    );

    CREATE TABLE IF NOT EXISTS earnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id INTEGER NOT NULL REFERENCES participants(id),
      team_id INTEGER NOT NULL REFERENCES teams(id),
      game_id INTEGER NOT NULL REFERENCES games(id),
      round_number INTEGER NOT NULL,
      amount REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // ── Multi-tournament migration ────────────────────────────────────────────────

  // M1: tournaments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      name                  TEXT NOT NULL DEFAULT 'March Madness Calcutta',
      invite_code           TEXT NOT NULL DEFAULT 'CHANGE-ME',
      auction_timer_seconds INTEGER NOT NULL DEFAULT 30,
      auction_grace_seconds INTEGER NOT NULL DEFAULT 15,
      auction_status        TEXT NOT NULL DEFAULT 'waiting',
      tournament_started    INTEGER NOT NULL DEFAULT 0,
      auction_order         TEXT NOT NULL DEFAULT 'random',
      auction_auto_advance  INTEGER NOT NULL DEFAULT 0,
      ai_commentary_enabled   INTEGER NOT NULL DEFAULT 1,
      auction_scheduled_start INTEGER DEFAULT NULL,
      created_at              INTEGER DEFAULT (unixepoch()),
      archived_at             INTEGER
    );
  `);

  // M-ai: add ai_commentary_enabled column to existing databases
  if (!columnExists('tournaments', 'ai_commentary_enabled')) {
    db.exec('ALTER TABLE tournaments ADD COLUMN ai_commentary_enabled INTEGER NOT NULL DEFAULT 1');
  }
  if (!columnExists('tournaments', 'auction_scheduled_start')) {
    db.exec('ALTER TABLE tournaments ADD COLUMN auction_scheduled_start INTEGER DEFAULT NULL');
  }

  // M2: Seed tournament id=1 from existing settings (if tournaments table is empty)
  const tournamentCount = db.prepare('SELECT COUNT(*) as c FROM tournaments').get().c;
  if (tournamentCount === 0) {
    const get = (key, fallback) =>
      db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? fallback;

    db.prepare(`
      INSERT INTO tournaments
        (id, name, invite_code, auction_timer_seconds, auction_grace_seconds,
         auction_status, tournament_started, auction_order, auction_auto_advance)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      get('tournament_name', 'March Madness Calcutta 2025'),
      get('invite_code', Math.random().toString(36).substring(2, 8).toUpperCase()),
      parseInt(get('auction_timer_seconds', '30')),
      parseInt(get('auction_grace_seconds', '15')),
      get('auction_status', 'waiting'),
      parseInt(get('tournament_started', '0')),
      get('auction_order', 'random'),
      parseInt(get('auction_auto_advance', '0')),
    );
  }

  // M3/M4: Add tournament_id columns to scoped tables (except ownership + payout_config handled below)
  const scopedTables = ['teams', 'auction_items', 'bids', 'games', 'earnings'];
  for (const tbl of scopedTables) {
    if (!columnExists(tbl, 'tournament_id')) {
      db.prepare(`ALTER TABLE ${tbl} ADD COLUMN tournament_id INTEGER DEFAULT 1`).run();
      db.prepare(`UPDATE ${tbl} SET tournament_id = 1 WHERE tournament_id IS NULL`).run();
    }
  }

  // M9: Rebuild ownership to change UNIQUE(team_id) → UNIQUE(tournament_id, team_id)
  if (!columnExists('ownership', 'tournament_id')) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE ownership_new (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          tournament_id  INTEGER NOT NULL DEFAULT 1,
          team_id        INTEGER NOT NULL REFERENCES teams(id),
          participant_id INTEGER NOT NULL REFERENCES participants(id),
          purchase_price REAL NOT NULL,
          UNIQUE(tournament_id, team_id)
        );
        INSERT INTO ownership_new SELECT id, 1, team_id, participant_id, purchase_price FROM ownership;
        DROP TABLE ownership;
        ALTER TABLE ownership_new RENAME TO ownership;
      `);
    })();
  }

  // M10: Rebuild payout_config to change UNIQUE(round_number) → UNIQUE(tournament_id, round_number)
  if (!columnExists('payout_config', 'tournament_id')) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE payout_config_new (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          tournament_id  INTEGER NOT NULL DEFAULT 1,
          round_number   INTEGER NOT NULL,
          round_name     TEXT NOT NULL,
          amount         REAL NOT NULL DEFAULT 0,
          payout_type    TEXT NOT NULL DEFAULT 'fixed',
          UNIQUE(tournament_id, round_number)
        );
        INSERT INTO payout_config_new
          SELECT id, 1, round_number, round_name, amount, payout_type FROM payout_config;
        DROP TABLE payout_config;
        ALTER TABLE payout_config_new RENAME TO payout_config;
      `);
    })();
  }

  // M5: Remove old tournament-scoped keys from settings
  const oldKeys = [
    'invite_code','auction_timer_seconds','auction_grace_seconds',
    'tournament_name','auction_status','tournament_started',
    'auction_order','auction_auto_advance',
  ];
  db.prepare(`DELETE FROM settings WHERE key IN (${oldKeys.map(() => '?').join(',')})`).run(...oldKeys);

  // M6: Ensure active_tournament_id exists
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('active_tournament_id', '1')").run();

  // M7: tournament_participants table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournament_participants (
      tournament_id  INTEGER NOT NULL REFERENCES tournaments(id),
      participant_id INTEGER NOT NULL REFERENCES participants(id),
      joined_at      INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (tournament_id, participant_id)
    );
  `);

  // M8: Populate tournament_participants for tournament 1 from existing participants
  db.prepare(`
    INSERT OR IGNORE INTO tournament_participants (tournament_id, participant_id)
    SELECT 1, id FROM participants
  `).run();

  // M11: Add end-of-round AI commentary column if missing
  if (!columnExists('tournaments', 'ai_commentary_end_of_round')) {
    db.exec('ALTER TABLE tournaments ADD COLUMN ai_commentary_end_of_round INTEGER NOT NULL DEFAULT 1');
  }

  // ── Legacy column migrations (pre-multi-tournament) ───────────────────────────

  // Migrate: add payout_type column if missing (very old databases)
  if (!columnExists('payout_config', 'payout_type')) {
    db.prepare("ALTER TABLE payout_config ADD COLUMN payout_type TEXT NOT NULL DEFAULT 'fixed'").run();
  }

  // Migrate: add espn_id and color columns to teams if missing
  if (!columnExists('teams', 'espn_id')) {
    db.prepare('ALTER TABLE teams ADD COLUMN espn_id INTEGER').run();
  }
  if (!columnExists('teams', 'color')) {
    db.prepare('ALTER TABLE teams ADD COLUMN color TEXT').run();
  }
  // Backfill espn_id and color for any existing teams missing them
  const backfillTeam = db.prepare('UPDATE teams SET espn_id = ?, color = ? WHERE name = ? AND espn_id IS NULL');
  for (const t of TEAMS_2025) {
    if (t.espn_id || t.color) backfillTeam.run(t.espn_id || null, t.color || null, t.name);
  }

  // ── Default payout config for tournament 1 ───────────────────────────────────
  const insertPayoutDefault = db.prepare(
    'INSERT OR IGNORE INTO payout_config (tournament_id, round_number, round_name, amount, payout_type) VALUES (?, ?, ?, ?, ?)'
  );
  for (const row of PAYOUT_DEFAULTS) insertPayoutDefault.run(1, ...row);

  // ── Seed teams if empty ───────────────────────────────────────────────────────
  const teamCount = db.prepare('SELECT COUNT(*) as c FROM teams').get().c;
  if (teamCount === 0) {
    seedTeamsForTournament(1, TEAMS_2025);
  }
}

// ── Tournament helpers ────────────────────────────────────────────────────────

function getActiveTournamentId() {
  const val = db.prepare("SELECT value FROM settings WHERE key = 'active_tournament_id'").get()?.value;
  return val ? parseInt(val) : 1;
}

function setActiveTournamentId(id) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('active_tournament_id', ?)").run(String(id));
}

function getTournament(id) {
  return db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
}

function getAllTournaments() {
  return db.prepare(`
    SELECT t.*,
           (SELECT COUNT(*) FROM tournament_participants tp WHERE tp.tournament_id = t.id) as participant_count
    FROM tournaments t
    ORDER BY t.created_at DESC
  `).all();
}

function createTournament({ name, inviteCode }) {
  const result = db.prepare(`
    INSERT INTO tournaments
      (name, invite_code, auction_timer_seconds, auction_grace_seconds,
       auction_status, tournament_started, auction_order, auction_auto_advance,
       ai_commentary_enabled, ai_commentary_end_of_round)
    VALUES (?, ?, 30, 15, 'waiting', 0, 'random', 0, 1, 1)
  `).run(name, inviteCode);

  const newTid = result.lastInsertRowid;

  // Seed default payout config for the new tournament
  const insertPayout = db.prepare(
    'INSERT OR IGNORE INTO payout_config (tournament_id, round_number, round_name, amount, payout_type) VALUES (?, ?, ?, ?, ?)'
  );
  db.transaction(() => {
    for (const row of PAYOUT_DEFAULTS) insertPayout.run(newTid, ...row);
  })();

  return newTid;
}

function getTournamentSetting(tid, key) {
  if (!TOURNAMENT_SETTING_KEYS.includes(key)) return null;
  const row = db.prepare(`SELECT ${key} FROM tournaments WHERE id = ?`).get(tid);
  return row != null ? String(row[key]) : null;
}

function setTournamentSetting(tid, key, val) {
  if (!TOURNAMENT_SETTING_KEYS.includes(key)) return;
  db.prepare(`UPDATE tournaments SET ${key} = ? WHERE id = ?`).run(String(val), tid);
}

// ── Legacy getSetting / setSetting (only for active_tournament_id now) ────────

const getSetting = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
const setSetting = (key, val) =>
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(val));

// ── Auction order ─────────────────────────────────────────────────────────────

function applyAuctionOrder(tid, order) {
  const _tid = tid ?? getActiveTournamentId();
  const _order = order ?? getTournamentSetting(_tid, 'auction_order') ?? 'random';

  const pending = db.prepare(`
    SELECT ai.id, t.seed, t.region
    FROM auction_items ai
    JOIN teams t ON ai.team_id = t.id
    WHERE ai.status = 'pending' AND ai.tournament_id = ?
  `).all(_tid);

  if (_order === 'seed_asc') {
    pending.sort((a, b) => a.seed - b.seed);
  } else if (_order === 'seed_desc') {
    pending.sort((a, b) => b.seed - a.seed);
  } else if (_order === 'region') {
    const regionOrder = { East: 0, West: 1, South: 2, Midwest: 3 };
    pending.sort((a, b) => {
      const rDiff = (regionOrder[a.region] ?? 99) - (regionOrder[b.region] ?? 99);
      return rDiff !== 0 ? rDiff : a.seed - b.seed;
    });
  } else {
    // 'random' — Fisher-Yates shuffle
    for (let i = pending.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pending[i], pending[j]] = [pending[j], pending[i]];
    }
  }

  const update = db.prepare('UPDATE auction_items SET queue_order = ? WHERE id = ?');
  db.transaction(() => {
    pending.forEach((item, i) => update.run(i, item.id));
  })();
}

// ── Team seeding ──────────────────────────────────────────────────────────────

function seedTeamsForTournament(tid, teams) {
  db.transaction(() => {
    db.prepare('DELETE FROM auction_items WHERE tournament_id = ?').run(tid);
    db.prepare('DELETE FROM bids WHERE tournament_id = ?').run(tid);
    db.prepare('DELETE FROM ownership WHERE tournament_id = ?').run(tid);
    db.prepare('DELETE FROM earnings WHERE tournament_id = ?').run(tid);
    db.prepare('DELETE FROM games WHERE tournament_id = ?').run(tid);
    db.prepare('DELETE FROM teams WHERE tournament_id = ?').run(tid);

    const insertTeam = db.prepare(
      'INSERT INTO teams (name, seed, region, espn_id, color, tournament_id) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const insertAuction = db.prepare(
      'INSERT INTO auction_items (team_id, queue_order, tournament_id) VALUES (?, ?, ?)'
    );

    teams.forEach((t, i) => {
      const result = insertTeam.run(t.name, t.seed, t.region, t.espn_id || null, t.color || null, tid);
      insertAuction.run(result.lastInsertRowid, i, tid);
    });

    db.prepare("UPDATE tournaments SET auction_status = 'waiting', tournament_started = 0 WHERE id = ?").run(tid);
  })();

  const order = getTournamentSetting(tid, 'auction_order') || 'random';
  applyAuctionOrder(tid, order);
}

// Keep legacy seedTeams for any direct callers
function seedTeams(teams) {
  seedTeamsForTournament(1, teams);
}

// ── Query helpers ─────────────────────────────────────────────────────────────

const getParticipantByToken = (token) =>
  db.prepare('SELECT * FROM participants WHERE session_token = ?').get(token);

function getAllParticipants(tid) {
  const _tid = tid ?? getActiveTournamentId();
  return db.prepare(`
    SELECT p.id, p.name, p.color, p.is_admin, p.created_at
    FROM participants p
    JOIN tournament_participants tp ON tp.participant_id = p.id
    WHERE tp.tournament_id = ? AND p.is_admin = 0
    ORDER BY tp.joined_at
  `).all(_tid);
}

const getTeams = (tid) => {
  const _tid = tid ?? getActiveTournamentId();
  return db.prepare('SELECT * FROM teams WHERE tournament_id = ? ORDER BY region, seed').all(_tid);
};

function getAuctionItems(tid) {
  const _tid = tid ?? getActiveTournamentId();
  return db.prepare(`
    SELECT ai.*, t.name as team_name, t.seed, t.region,
           t.espn_id as team_espn_id, t.color as team_color,
           p.name as leader_name, p.color as leader_color,
           w.name as winner_name, w.color as winner_color
    FROM auction_items ai
    JOIN teams t ON ai.team_id = t.id
    LEFT JOIN participants p ON ai.current_leader_id = p.id
    LEFT JOIN participants w ON ai.winner_id = w.id
    WHERE ai.tournament_id = ?
    ORDER BY ai.queue_order
  `).all(_tid);
}

function getActiveAuctionItem(tid) {
  const _tid = tid ?? getActiveTournamentId();
  return db.prepare(`
    SELECT ai.*, t.name as team_name, t.seed, t.region,
           t.espn_id as team_espn_id, t.color as team_color,
           p.name as leader_name, p.color as leader_color
    FROM auction_items ai
    JOIN teams t ON ai.team_id = t.id
    LEFT JOIN participants p ON ai.current_leader_id = p.id
    WHERE ai.status = 'active' AND ai.tournament_id = ?
    LIMIT 1
  `).get(_tid);
}

const getRecentBids = (teamId, limit = 10) =>
  db.prepare(`
    SELECT b.*, p.name as participant_name, p.color
    FROM bids b
    JOIN participants p ON b.participant_id = p.id
    WHERE b.team_id = ?
    ORDER BY b.created_at DESC
    LIMIT ?
  `).all(teamId, limit);

function getOwnership(tid) {
  const _tid = tid ?? getActiveTournamentId();
  return db.prepare(`
    SELECT o.*, t.name as team_name, t.seed, t.region, t.eliminated,
           t.espn_id as team_espn_id, t.color as team_color,
           p.name as owner_name, p.color as owner_color
    FROM ownership o
    JOIN teams t ON o.team_id = t.id
    JOIN participants p ON o.participant_id = p.id
    WHERE o.tournament_id = ?
    ORDER BY p.name, t.region, t.seed
  `).all(_tid);
}

function getFullStandings(tid) {
  const _tid = tid ?? getActiveTournamentId();
  return db.prepare(`
    SELECT p.id, p.name, p.color,
           COALESCE(o_agg.teams_owned, 0)  as teams_owned,
           COALESCE(o_agg.total_spent, 0)  as total_spent,
           COALESCE(e_agg.total_earned, 0) as total_earned
    FROM participants p
    JOIN tournament_participants tp ON tp.participant_id = p.id AND tp.tournament_id = ?
    LEFT JOIN (
      SELECT participant_id,
             COUNT(*)            as teams_owned,
             SUM(purchase_price) as total_spent
      FROM ownership
      WHERE tournament_id = ?
      GROUP BY participant_id
    ) o_agg ON o_agg.participant_id = p.id
    LEFT JOIN (
      SELECT participant_id,
             SUM(amount) as total_earned
      FROM earnings
      WHERE tournament_id = ?
      GROUP BY participant_id
    ) e_agg ON e_agg.participant_id = p.id
    WHERE p.is_admin = 0
    ORDER BY total_earned DESC, total_spent ASC
  `).all(_tid, _tid, _tid);
}

function getGames(tid) {
  const _tid = tid ?? getActiveTournamentId();
  return db.prepare(`
    SELECT g.*,
           t1.name as team1_name, t1.seed as team1_seed, t1.region as team1_region,
           t2.name as team2_name, t2.seed as team2_seed, t2.region as team2_region,
           w.name as winner_name,
           o1.participant_id as team1_owner_id, p1.name as team1_owner_name, p1.color as team1_owner_color,
           o2.participant_id as team2_owner_id, p2.name as team2_owner_name, p2.color as team2_owner_color
    FROM games g
    LEFT JOIN teams t1 ON g.team1_id = t1.id
    LEFT JOIN teams t2 ON g.team2_id = t2.id
    LEFT JOIN teams w ON g.winner_id = w.id
    LEFT JOIN ownership o1 ON o1.team_id = t1.id AND o1.tournament_id = g.tournament_id
    LEFT JOIN participants p1 ON p1.id = o1.participant_id
    LEFT JOIN ownership o2 ON o2.team_id = t2.id AND o2.tournament_id = g.tournament_id
    LEFT JOIN participants p2 ON p2.id = o2.participant_id
    WHERE g.tournament_id = ?
    ORDER BY g.round, g.region, g.position
  `).all(_tid);
}

function getPayoutConfig(tid) {
  const _tid = tid ?? getActiveTournamentId();
  return db.prepare('SELECT * FROM payout_config WHERE tournament_id = ? ORDER BY round_number').all(_tid);
}

// ── Shared query helpers ─────────────────────────────────────────────────────

function getTotalPot(tid) {
  const _tid = tid ?? getActiveTournamentId();
  return db.prepare(
    'SELECT COALESCE(SUM(purchase_price), 0) as total FROM ownership WHERE tournament_id = ?'
  ).get(_tid).total;
}

function getGameById(gameId, tid) {
  return db.prepare('SELECT * FROM games WHERE id = ? AND tournament_id = ?').get(gameId, tid);
}

function getGameByPosition(round, region, position, tid) {
  return db.prepare(
    'SELECT * FROM games WHERE round = ? AND region = ? AND position = ? AND tournament_id = ?'
  ).get(round, region, position, tid);
}

function calculatePayoutAmount(payoutConfig, totalPot) {
  if (!payoutConfig || payoutConfig.amount <= 0) return 0;
  if (payoutConfig.payout_type === 'percent') {
    return parseFloat(((payoutConfig.amount / 100) * totalPot).toFixed(2));
  }
  return payoutConfig.amount;
}

function columnExists(tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().map((c) => c.name).includes(columnName);
}

// ── Earnings recalculation ────────────────────────────────────────────────────

function recalcEarnings(tid) {
  const _tid = tid ?? getActiveTournamentId();

  const completedGames = db.prepare(
    'SELECT id, round, winner_id FROM games WHERE winner_id IS NOT NULL AND tournament_id = ?'
  ).all(_tid);

  const totalPot = getTotalPot(_tid);

  db.transaction(() => {
    db.prepare('DELETE FROM earnings WHERE tournament_id = ?').run(_tid);

    const getPayoutRow = db.prepare(
      'SELECT * FROM payout_config WHERE round_number = ? AND tournament_id = ?'
    );
    const getOwner = db.prepare(
      'SELECT * FROM ownership WHERE team_id = ? AND tournament_id = ?'
    );
    const insertEarning = db.prepare(
      'INSERT INTO earnings (participant_id, team_id, game_id, round_number, amount, tournament_id) VALUES (?, ?, ?, ?, ?, ?)'
    );

    for (const game of completedGames) {
      const payoutConfig = getPayoutRow.get(game.round, _tid);
      if (!payoutConfig || payoutConfig.amount <= 0) continue;

      const payoutAmount = calculatePayoutAmount(payoutConfig, totalPot);
      if (payoutAmount <= 0) continue;

      const ownership = getOwner.get(game.winner_id, _tid);
      if (!ownership) continue;

      insertEarning.run(ownership.participant_id, game.winner_id, game.id, game.round, payoutAmount, _tid);
    }
  })();
}

module.exports = {
  db,
  init,
  TOURNAMENT_SETTING_KEYS,
  // Tournament management
  getActiveTournamentId,
  setActiveTournamentId,
  getTournament,
  getAllTournaments,
  createTournament,
  getTournamentSetting,
  setTournamentSetting,
  // Legacy settings (only active_tournament_id remains)
  getSetting,
  setSetting,
  // Team seeding
  seedTeams,
  seedTeamsForTournament,
  applyAuctionOrder,
  // Earnings
  recalcEarnings,
  // Query helpers
  getParticipantByToken,
  getAllParticipants,
  getTeams,
  getAuctionItems,
  getActiveAuctionItem,
  getRecentBids,
  getOwnership,
  getFullStandings,
  getGames,
  getPayoutConfig,
  getTotalPot,
  getGameById,
  getGameByPosition,
  calculatePayoutAmount,
};
