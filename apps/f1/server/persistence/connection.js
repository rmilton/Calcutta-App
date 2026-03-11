const Database = require('better-sqlite3');
const { resolveDbPath } = require('../lib/localDevPaths');

const DB_PATH = resolveDbPath();
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = {
  db,
  DB_PATH,
};
