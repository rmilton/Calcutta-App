const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const ADMIN_API_PATH = path.resolve(
  __dirname,
  '../../client/src/pages/admin/adminApi.js',
);

test('admin api helper selects correct sync-next endpoint', async () => {
  const { syncNextEndpoint } = await import(`file://${ADMIN_API_PATH}`);
  assert.equal(syncNextEndpoint(false), '/admin/results/sync-next');
  assert.equal(syncNextEndpoint(true), '/admin/results/advance-next');
});

test('admin api helper normalizes settings and rules payloads', async () => {
  const { normalizeSettingsPayload, normalizeRulesPayload } = await import(`file://${ADMIN_API_PATH}`);

  const settings = normalizeSettingsPayload({
    auction_timer_seconds: '45',
    auction_grace_seconds: '15',
    auction_auto_advance: true,
  });
  assert.deepEqual(settings, {
    auction_timer_seconds: 45,
    auction_grace_seconds: 15,
    auction_auto_advance: 1,
  });

  const rules = normalizeRulesPayload({
    grand_prix: [{ id: 1, bps: '90' }],
    sprint: [{ id: 2, bps: '30' }],
    season_bonus: [{ id: 3, bps: '120' }],
  });
  assert.equal(rules.grand_prix[0].bps, 90);
  assert.equal(rules.sprint[0].bps, 30);
  assert.equal(rules.season_bonus[0].bps, 120);
});
