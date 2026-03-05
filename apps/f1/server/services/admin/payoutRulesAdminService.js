const {
  db,
  getEventPayoutRules,
  getSeasonBonusRules,
} = require('../../db');
const { recalcSeasonBonuses } = require('../scoringService');

function getPayoutRulesForSeason({ seasonId }) {
  return {
    grand_prix: getEventPayoutRules(seasonId, 'grand_prix'),
    sprint: getEventPayoutRules(seasonId, 'sprint'),
    season_bonus: getSeasonBonusRules(seasonId),
  };
}

function savePayoutRulesForSeason({ seasonId, payload, io }) {
  const { grand_prix, sprint, season_bonus } = payload || {};

  const updateEventRule = db.prepare(`
    UPDATE event_payout_rules
    SET bps = ?, active = ?, label = ?, rank_order = ?
    WHERE id = ? AND season_id = ?
  `);

  const updateSeasonBonus = db.prepare(`
    UPDATE season_bonus_rules
    SET bps = ?, active = ?, label = ?, rank_order = ?
    WHERE id = ? AND season_id = ?
  `);

  db.transaction(() => {
    [grand_prix, sprint].forEach((rules) => {
      if (!Array.isArray(rules)) return;
      rules.forEach((rule) => {
        updateEventRule.run(
          parseInt(rule.bps, 10) || 0,
          rule.active ? 1 : 0,
          String(rule.label || ''),
          parseInt(rule.rank_order, 10) || 1,
          rule.id,
          seasonId,
        );
      });
    });

    if (Array.isArray(season_bonus)) {
      season_bonus.forEach((rule) => {
        updateSeasonBonus.run(
          parseInt(rule.bps, 10) || 0,
          rule.active ? 1 : 0,
          String(rule.label || ''),
          parseInt(rule.rank_order, 10) || 1,
          rule.id,
          seasonId,
        );
      });
    }
  })();

  recalcSeasonBonuses({ seasonId });
  io?.emit('standings:update');
  return { ok: true };
}

module.exports = {
  getPayoutRulesForSeason,
  savePayoutRulesForSeason,
};
