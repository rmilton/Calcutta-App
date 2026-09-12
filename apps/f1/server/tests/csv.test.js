const test = require('node:test');
const assert = require('node:assert/strict');
const { csvCell, rowsToCsv } = require('../lib/csv');

test('csvCell passes through null/undefined as empty string', () => {
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
});

test('csvCell coerces non-string values', () => {
  assert.equal(csvCell(123), '123');
  assert.equal(csvCell(0), '0');
  assert.equal(csvCell(false), 'false');
});

test('csvCell passes plain text through unescaped', () => {
  assert.equal(csvCell('plain'), 'plain');
});

test('csvCell quotes and escapes a value containing a comma', () => {
  assert.equal(csvCell('has,comma'), '"has,comma"');
});

test('csvCell quotes and doubles embedded quotes', () => {
  assert.equal(csvCell('a"b'), '"a""b"');
});

test('csvCell quotes a value containing a newline', () => {
  assert.equal(csvCell('line1\nline2'), '"line1\nline2"');
});

test('rowsToCsv joins cells with commas and rows with newlines', () => {
  const csv = rowsToCsv([
    ['Category', 'Amount'],
    ['Race Winner', 500],
  ]);
  assert.equal(csv, 'Category,Amount\nRace Winner,500');
});

test('rowsToCsv escapes cells that need it within a full table', () => {
  const csv = rowsToCsv([
    ['a', 1],
    ['b,c', 2],
  ]);
  assert.equal(csv, 'a,1\n"b,c",2');
});
