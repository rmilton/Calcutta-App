const {
  EVENT_RULES,
  DEFAULT_SEASON_BONUS_RULES,
  DEPRECATED_SEASON_BONUS_CATEGORIES,
  PAYOUT_MODEL_V2,
} = require('../../data/payoutRules');

function drawRandomPosition(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function applyPayoutModelV2Migration(db, seasonId) {
  const season = db.prepare('SELECT id, payout_model_version FROM seasons WHERE id = ?').get(seasonId);
  if (!season) {
    return { migrated: false };
  }
  const currentVersion = Number(season.payout_model_version) || 1;

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

  const updateEventRandomDraw = db.prepare(`
    UPDATE events
    SET random_bonus_position = ?, random_bonus_drawn_at = ?
    WHERE id = ? AND season_id = ?
  `);
  let adjustedRandomDraws = 0;

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

    const scoredEvents = db.prepare(`
      SELECT id, random_bonus_position
      FROM events
      WHERE season_id = ? AND status = 'scored' AND type IN ('grand_prix', 'sprint')
    `).all(seasonId);

    scoredEvents.forEach((event) => {
      const pos = Number(event.random_bonus_position);
      if (!pos || pos < 4 || pos > 20) {
        updateEventRandomDraw.run(drawRandomPosition(4, 20), now, event.id, seasonId);
        adjustedRandomDraws += 1;
      }
    });

    db.prepare(`
      UPDATE seasons
      SET payout_model_version = ?
      WHERE id = ?
    `).run(PAYOUT_MODEL_V2, seasonId);
  })();

  return {
    migrated: currentVersion < PAYOUT_MODEL_V2,
    adjustedRandomDraws,
  };
}

module.exports = {
  applyPayoutModelV2Migration,
};
