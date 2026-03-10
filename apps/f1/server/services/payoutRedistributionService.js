const {
  amountFromBps,
  allocateByBps,
} = require('../lib/core');
const {
  db,
  getEventPayoutRules,
  getSeasonBonusRules,
  getTotalPotCents,
} = require('../db');

function isScoringEvent(event) {
  return event?.type === 'grand_prix' || event?.type === 'sprint';
}

function sumBps(rules) {
  return (rules || []).reduce((sum, rule) => sum + (Number(rule.bps) || 0), 0);
}

function effectiveBpsFromCents(totalPotCents, cents) {
  const totalPot = Number(totalPotCents || 0);
  if (totalPot <= 0) return 0;
  return Number((((Number(cents) || 0) * 10000) / totalPot).toFixed(2));
}

function getRedistributionRows(seasonId) {
  return db.prepare(`
    SELECT id, season_id, source_event_id, target_kind, target_event_id, amount_cents, created_at
    FROM event_redistributions
    WHERE season_id = ?
    ORDER BY id ASC
  `).all(seasonId);
}

function summarizeRedistributions(redistributionRows) {
  const inboundByEventId = new Map();
  const outboundBySourceId = new Map();
  let seasonBonusRolloverCents = 0;

  (redistributionRows || []).forEach((row) => {
    const amount = Number(row.amount_cents || 0);
    if (row.target_kind === 'event' && row.target_event_id != null) {
      inboundByEventId.set(
        Number(row.target_event_id),
        (inboundByEventId.get(Number(row.target_event_id)) || 0) + amount,
      );
    }

    const currentOutbound = outboundBySourceId.get(Number(row.source_event_id)) || {
      totalCents: 0,
      eventCents: 0,
      seasonBonusCents: 0,
    };
    currentOutbound.totalCents += amount;
    if (row.target_kind === 'season_bonus') {
      currentOutbound.seasonBonusCents += amount;
      seasonBonusRolloverCents += amount;
    } else {
      currentOutbound.eventCents += amount;
    }
    outboundBySourceId.set(Number(row.source_event_id), currentOutbound);
  });

  return {
    inboundByEventId,
    outboundBySourceId,
    seasonBonusRolloverCents,
  };
}

function buildEffectiveAllocationRows(rules, totalCents) {
  const totalRuleBps = Math.max(1, sumBps(rules));
  const entries = allocateByBps(totalCents, (rules || []).map((rule) => ({
    ruleId: rule.id,
    category: rule.category,
    label: rule.label,
    rank_order: Number(rule.rank_order || 1),
    base_bps: Number(rule.bps || 0),
    bps: (Number(rule.bps || 0) * 10000) / totalRuleBps,
  })));

  return entries.map((entry) => ({
    rule_id: entry.ruleId,
    category: entry.category,
    label: entry.label,
    rank_order: entry.rank_order,
    base_bps: entry.base_bps,
    cents: Number(entry.cents || 0),
  }));
}

function buildEventPayoutComputation({
  seasonId,
  event,
  totalPotCents = null,
  redistributionRows = null,
}) {
  if (!isScoringEvent(event)) {
    return {
      rules: [],
      baseTotalBps: 0,
      baseTotalCents: 0,
      effectiveTotalBps: 0,
      effectiveTotalCents: 0,
      redistributedPoolCents: 0,
    };
  }

  const totalPot = totalPotCents == null ? getTotalPotCents(seasonId) : totalPotCents;
  const rules = getEventPayoutRules(seasonId, event.type);
  const baseRuleRows = (rules || []).map((rule) => ({
    rule_id: rule.id,
    category: rule.category,
    label: rule.label,
    rank_order: Number(rule.rank_order || 1),
    base_bps: Number(rule.bps || 0),
    cents: amountFromBps(totalPot, rule.bps),
  }));
  const baseTotalCents = baseRuleRows.reduce((sum, row) => sum + row.cents, 0);
  const redistributionSummary = summarizeRedistributions(
    redistributionRows == null ? getRedistributionRows(seasonId) : redistributionRows,
  );
  const redistributedPoolCents = redistributionSummary.inboundByEventId.get(Number(event.id)) || 0;
  const effectiveTotalCents = baseTotalCents + redistributedPoolCents;
  const effectiveRuleRows = buildEffectiveAllocationRows(rules, effectiveTotalCents);

  const baseByCategory = new Map(
    baseRuleRows.map((row) => [`${row.category}:${row.rank_order}`, row.cents]),
  );

  return {
    rules: effectiveRuleRows.map((row) => ({
      ...row,
      base_category_cents: baseByCategory.get(`${row.category}:${row.rank_order}`) || 0,
      category_pot_cents: row.cents,
      redistributed_cents: row.cents - (baseByCategory.get(`${row.category}:${row.rank_order}`) || 0),
    })),
    baseTotalBps: sumBps(rules),
    baseTotalCents,
    effectiveTotalBps: effectiveBpsFromCents(totalPot, effectiveTotalCents),
    effectiveTotalCents,
    redistributedPoolCents,
  };
}

function buildSeasonBonusComputation({
  seasonId,
  totalPotCents = null,
  redistributionRows = null,
}) {
  const totalPot = totalPotCents == null ? getTotalPotCents(seasonId) : totalPotCents;
  const rules = getSeasonBonusRules(seasonId);
  const baseRuleRows = (rules || []).map((rule) => ({
    rule_id: rule.id,
    category: rule.category,
    label: rule.label,
    rank_order: Number(rule.rank_order || 1),
    base_bps: Number(rule.bps || 0),
    cents: amountFromBps(totalPot, rule.bps),
  }));
  const baseTotalCents = baseRuleRows.reduce((sum, row) => sum + row.cents, 0);
  const redistributionSummary = summarizeRedistributions(
    redistributionRows == null ? getRedistributionRows(seasonId) : redistributionRows,
  );
  const redistributedPoolCents = redistributionSummary.seasonBonusRolloverCents;
  const effectiveTotalCents = baseTotalCents + redistributedPoolCents;
  const effectiveRuleRows = buildEffectiveAllocationRows(rules, effectiveTotalCents);

  const baseByCategory = new Map(
    baseRuleRows.map((row) => [`${row.category}:${row.rank_order}`, row.cents]),
  );

  return {
    rules: effectiveRuleRows.map((row) => ({
      ...row,
      base_category_cents: baseByCategory.get(`${row.category}:${row.rank_order}`) || 0,
      category_pot_cents: row.cents,
      redistributed_cents: row.cents - (baseByCategory.get(`${row.category}:${row.rank_order}`) || 0),
    })),
    baseTotalBps: sumBps(rules),
    baseTotalCents,
    effectiveTotalBps: effectiveBpsFromCents(totalPot, effectiveTotalCents),
    effectiveTotalCents,
    redistributedPoolCents,
  };
}

function listFutureRedistributionTargets({ seasonId, sourceEvent }) {
  if (!isScoringEvent(sourceEvent)) return [];

  return db.prepare(`
    SELECT id, season_id, round_number, type, status
    FROM events
    WHERE season_id = ?
      AND type = ?
      AND round_number > ?
      AND status IN ('pending', 'results_loaded')
    ORDER BY round_number ASC
  `).all(seasonId, sourceEvent.type, sourceEvent.round_number);
}

function decorateEventsWithAdminPreview({ seasonId, events }) {
  const totalPotCents = getTotalPotCents(seasonId);
  const redistributionRows = getRedistributionRows(seasonId);
  const redistributionSummary = summarizeRedistributions(redistributionRows);

  return (events || []).map((event) => {
    if (!isScoringEvent(event)) return event;

    const outbound = redistributionSummary.outboundBySourceId.get(Number(event.id)) || {
      totalCents: 0,
      eventCents: 0,
      seasonBonusCents: 0,
    };

    if (event.status === 'cancelled' || event.status === 'scored') {
      return {
        ...event,
        base_total_bps: null,
        effective_total_bps: null,
        redistributed_pool_cents: null,
        payout_preview_rules: [],
        redistributed_outbound_cents: outbound.totalCents,
        rolled_to_season_bonus_cents: outbound.seasonBonusCents,
      };
    }

    const preview = buildEventPayoutComputation({
      seasonId,
      event,
      totalPotCents,
      redistributionRows,
    });

    return {
      ...event,
      base_total_bps: preview.baseTotalBps,
      effective_total_bps: preview.effectiveTotalBps,
      redistributed_pool_cents: preview.redistributedPoolCents,
      payout_preview_rules: preview.rules.map((rule) => ({
        category: rule.category,
        label: rule.label,
        rank_order: rule.rank_order,
        base_bps: rule.base_bps,
        base_category_cents: rule.base_category_cents,
        category_pot_cents: rule.category_pot_cents,
        redistributed_cents: rule.redistributed_cents,
      })),
      redistributed_outbound_cents: outbound.totalCents,
      rolled_to_season_bonus_cents: outbound.seasonBonusCents,
    };
  });
}

module.exports = {
  buildEventPayoutComputation,
  buildSeasonBonusComputation,
  decorateEventsWithAdminPreview,
  getRedistributionRows,
  listFutureRedistributionTargets,
  summarizeRedistributions,
  isScoringEvent,
};
