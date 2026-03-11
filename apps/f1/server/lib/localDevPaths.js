const fs = require('fs');
const os = require('os');
const path = require('path');

const SHARED_LOCAL_DIR = process.env.F1_LOCAL_SHARED_DIR
  || path.join(os.homedir(), 'Code', 'Calcutta-App-local', 'f1');
const SHARED_ENV_PATH = process.env.F1_SHARED_ENV_PATH
  || path.join(SHARED_LOCAL_DIR, 'f1.local.env');
const SHARED_DB_PATH = process.env.F1_SHARED_DB_PATH
  || path.join(SHARED_LOCAL_DIR, 'f1-calcutta-local-dev.db');
const APP_ENV_PATH = path.join(__dirname, '..', '..', '.env');
const ROOT_ENV_PATH = path.join(__dirname, '..', '..', '..', '.env');
const WORKTREE_DB_PATH = path.join(__dirname, '..', 'f1-calcutta.db');

function envSearchPaths() {
  return [SHARED_ENV_PATH, ROOT_ENV_PATH, APP_ENV_PATH];
}

function resolveDbPath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  if (fs.existsSync(SHARED_DB_PATH)) return SHARED_DB_PATH;
  return WORKTREE_DB_PATH;
}

module.exports = {
  APP_ENV_PATH,
  ROOT_ENV_PATH,
  SHARED_DB_PATH,
  SHARED_ENV_PATH,
  SHARED_LOCAL_DIR,
  WORKTREE_DB_PATH,
  envSearchPaths,
  resolveDbPath,
};
