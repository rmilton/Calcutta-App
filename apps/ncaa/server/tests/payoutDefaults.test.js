const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EXPECTED_DEFAULTS = [
  { round_number: 1, amount: 1.0, payout_type: 'percent' },
  { round_number: 2, amount: 1.5, payout_type: 'percent' },
  { round_number: 3, amount: 2.0, payout_type: 'percent' },
  { round_number: 4, amount: 3.0, payout_type: 'percent' },
  { round_number: 5, amount: 3.5, payout_type: 'percent' },
  { round_number: 6, amount: 5.0, payout_type: 'percent' },
];

let tmpDir;
let db;
let dbModule;
let tid;

function assertDefaultPayouts(rows) {
  assert.equal(rows.length, EXPECTED_DEFAULTS.length);
  for (const expected of EXPECTED_DEFAULTS) {
    const row = rows.find((r) => r.round_number === expected.round_number);
    assert.ok(row, `Missing row for round ${expected.round_number}`);
    assert.equal(row.payout_type, expected.payout_type);
    assert.equal(Number(row.amount), expected.amount);
  }
}

test.beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calcutta-payout-defaults-test-'));
  process.env.DB_PATH = path.join(tmpDir, 'test.db');

  delete require.cache[require.resolve('../db')];
  dbModule = require('../db');
  dbModule.init();

  db = dbModule.db;
  tid = dbModule.getActiveTournamentId();
});

test.afterEach(() => {
  try {
    db.close();
  } catch {
    // ignore cleanup errors
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('fresh payout config defaults to NCAA round percentages', () => {
  const rows = dbModule.getPayoutConfig(tid);
  assertDefaultPayouts(rows);
});

test('loading payouts restores defaults for an unconfigured baseline', () => {
  db.prepare("UPDATE payout_config SET amount = 0, payout_type = 'fixed' WHERE tournament_id = ?").run(tid);

  const rows = dbModule.getPayoutConfig(tid);
  assertDefaultPayouts(rows);
});

test('loading payouts does not override an existing custom payout configuration', () => {
  db.prepare(
    "UPDATE payout_config SET amount = 99, payout_type = 'fixed' WHERE tournament_id = ? AND round_number = 1"
  ).run(tid);

  const rows = dbModule.getPayoutConfig(tid);
  const round1 = rows.find((r) => r.round_number === 1);

  assert.ok(round1);
  assert.equal(round1.amount, 99);
  assert.equal(round1.payout_type, 'fixed');
});
