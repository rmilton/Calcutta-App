const {
  db,
  getEventById,
  getEventResults,
} = require('../db');
const { evaluateCategoryRule } = require('./payoutRuleResolvers');
const { buildSeasonBonusComputation } = require('./payoutRedistributionService');
const { rowsToCsv } = require('../lib/csv');
const {
  isSeasonBonusReady,
  getAllSeasonResultRows,
  getChampionshipStandings,
  resolveSeasonBonusWinners,
  getSeasonScoringEventCounts,
  peekSeasonRandomBonusPosition,
} = require('./scoringService');

const SEASON_BONUS_PENDING_REASON =
  'Season bonuses are calculated once every race and sprint has been scored.';

function clampNonNegative(value) {
  const num = Number(value) || 0;
  return num > 0 ? num : 0;
}

/**
 * Driver identity lookup that deliberately does NOT filter by `active`
 * (unlike db.getDrivers). Unowned winners are frequently the inactive
 * substitute drivers created during results sync (ensureSeasonDriverForResultRow),
 * so a lookup scoped to active=1 would show them with a blank name.
 */
function getSeasonDriversById(seasonId) {
  const rows = db.prepare(`
    SELECT id, code, name, team_name
    FROM drivers
    WHERE season_id = ?
  `).all(seasonId);
  return new Map(rows.map((driver) => [driver.id, driver]));
}

/**
 * Cheap, authoritative per-event leakage: what each scored scoring event's
 * snapshot pool allocated vs. what was actually paid out. The difference is
 * money the payout rules earmarked but never disbursed (unowned category
 * winners, or categories no driver satisfied).
 *
 * Cancelled events are excluded here (status filter) because their value moves
 * through event_redistributions instead; counting them would double-count.
 */
function getScoredEventLeakageRows(seasonId) {
  return db.prepare(`
    SELECT
      e.id AS event_id,
      e.round_number,
      e.name,
      e.type,
      COALESCE(snap.pot_cents, 0) AS pot_cents,
      COALESCE(pay.paid_cents, 0) AS paid_cents
    FROM events e
    LEFT JOIN (
      SELECT event_id, SUM(category_pot_cents) AS pot_cents
      FROM event_payout_snapshots
      WHERE season_id = ?
      GROUP BY event_id
    ) snap ON snap.event_id = e.id
    LEFT JOIN (
      SELECT event_id, SUM(amount_cents) AS paid_cents
      FROM event_payouts
      WHERE season_id = ?
      GROUP BY event_id
    ) pay ON pay.event_id = e.id
    WHERE e.season_id = ?
      AND e.type IN ('grand_prix', 'sprint')
      AND e.status = 'scored'
    ORDER BY e.round_number ASC,
      CASE WHEN e.type = 'sprint' THEN 0 ELSE 1 END ASC
  `).all(seasonId, seasonId, seasonId);
}

/**
 * Per-category breakdown for the flagged events. Deliberately reads only
 * persisted tables (event_payout_snapshots for the pot, event_payouts for
 * what was actually paid) rather than re-deriving "who is owned" from the
 * CURRENT ownership table — ownership can change after scoring (e.g. the
 * admin "Reset Auction Only" tool clears ownership but leaves results/
 * payouts intact), and a live re-derivation would make this breakdown
 * disagree with the persisted, authoritative event total above it.
 *
 * Winner identity for the unpaid share still needs evaluateCategoryRule
 * against event_results, since scoring never persists "who won but wasn't
 * paid" anywhere — but event_results/snapshots/payouts are always rewritten
 * together by scoreEvent, so that derivation stays in lockstep with the
 * persisted pot/paid totals even though ownership isn't.
 */
function buildEventCategoryBreakdown({ seasonId, eventId }) {
  const event = getEventById(seasonId, eventId);
  if (!event) return [];

  const snapshotRows = db.prepare(`
    SELECT category, label, rank_order, category_pot_cents
    FROM event_payout_snapshots
    WHERE season_id = ? AND event_id = ?
    ORDER BY category ASC, rank_order ASC
  `).all(seasonId, eventId);
  if (!snapshotRows.length) return [];

  const paidRows = db.prepare(`
    SELECT category, driver_id, SUM(amount_cents) AS paid_cents
    FROM event_payouts
    WHERE season_id = ? AND event_id = ?
    GROUP BY category, driver_id
  `).all(seasonId, eventId);
  const paidCentsByCategory = new Map();
  const paidDriverIdsByCategory = new Map();
  paidRows.forEach((row) => {
    paidCentsByCategory.set(
      row.category,
      (paidCentsByCategory.get(row.category) || 0) + Number(row.paid_cents || 0),
    );
    if (!paidDriverIdsByCategory.has(row.category)) {
      paidDriverIdsByCategory.set(row.category, new Set());
    }
    paidDriverIdsByCategory.get(row.category).add(row.driver_id);
  });

  const results = getEventResults(eventId);
  const resultByDriverId = new Map(results.map((row) => [row.driver_id, row]));

  return snapshotRows
    .map((row) => {
      const potCents = Number(row.category_pot_cents || 0);
      const paidCents = paidCentsByCategory.get(row.category) || 0;
      const unallocatedCents = clampNonNegative(potCents - paidCents);
      if (unallocatedCents <= 0) return null;

      const evaluation = evaluateCategoryRule({
        category: row.category,
        rows: results,
        event,
        rankOrder: row.rank_order,
      });
      const winnerDriverIds = evaluation.winnerDriverIds || [];
      const paidDriverIds = paidDriverIdsByCategory.get(row.category) || new Set();
      const unpaidWinners = winnerDriverIds.filter((driverId) => !paidDriverIds.has(driverId));

      return {
        category: row.category,
        label: row.label,
        potCents,
        paidCents,
        unallocatedCents,
        status: winnerDriverIds.length ? 'unowned_winners' : 'no_winners',
        statusReason: winnerDriverIds.length
          ? (paidCents > 0
            ? 'Partially distributed; at least one winner had no owner'
            : 'No payout distributed; winners had no owner')
          : 'No driver matched this rule in event results',
        unownedWinners: unpaidWinners.map((driverId) => {
          const result = resultByDriverId.get(driverId);
          return {
            driverCode: result?.driver_code || null,
            driverName: result?.driver_name || null,
            teamName: result?.team_name || null,
            finishPosition: result?.finish_position ?? null,
          };
        }),
      };
    })
    .filter(Boolean);
}

/**
 * Season-bonus leakage. Bonuses only score once the season is complete
 * (isSeasonBonusReady), so until then the whole bonus pool is "pending", not
 * unallocated. After that, any bonus category resolving to an unowned driver
 * is real leakage.
 *
 * Like buildEventCategoryBreakdown, the pot/paid figures come only from
 * persisted tables (buildSeasonBonusComputation's rule pots and the actual
 * season_bonus_payouts rows recalcSeasonBonuses wrote), not from re-checking
 * CURRENT ownership. Winner identity for the unpaid share is re-derived via
 * resolveSeasonBonusWinners against event_results/standings, which only
 * change together with season_bonus_payouts (both are rewritten by
 * recalcSeasonBonuses), so this stays consistent even if ownership is later
 * reset independently.
 */
function buildSeasonBonusUnallocated(seasonId) {
  const computation = buildSeasonBonusComputation({ seasonId });
  const potCents = Number(computation.effectiveTotalCents || 0);

  const paidRows = db.prepare(`
    SELECT category, driver_id, SUM(amount_cents) AS paid_cents
    FROM season_bonus_payouts
    WHERE season_id = ?
    GROUP BY category, driver_id
  `).all(seasonId);
  const paidCentsByCategory = new Map();
  const paidDriverIdsByCategory = new Map();
  paidRows.forEach((row) => {
    paidCentsByCategory.set(
      row.category,
      (paidCentsByCategory.get(row.category) || 0) + Number(row.paid_cents || 0),
    );
    if (!paidDriverIdsByCategory.has(row.category)) {
      paidDriverIdsByCategory.set(row.category, new Set());
    }
    paidDriverIdsByCategory.get(row.category).add(row.driver_id);
  });
  const paidCents = Array.from(paidCentsByCategory.values())
    .reduce((sum, cents) => sum + cents, 0);

  const resolved = isSeasonBonusReady(seasonId);
  const unallocatedCents = resolved ? clampNonNegative(potCents - paidCents) : 0;

  let categories = [];
  if (resolved && unallocatedCents > 0 && computation.rules.length) {
    const rows = getAllSeasonResultRows(seasonId);
    const standings = getChampionshipStandings(seasonId, rows);
    const driverById = getSeasonDriversById(seasonId);

    categories = computation.rules
      .map((rule) => {
        const categoryPotCents = Number(rule.category_pot_cents || 0);
        const categoryPaidCents = paidCentsByCategory.get(rule.category) || 0;
        const unallocated = clampNonNegative(categoryPotCents - categoryPaidCents);
        if (unallocated <= 0) return null;

        // season_random_finish_position's resolver draws and persists the
        // random position if one isn't set yet. In every currently-reachable
        // flow recalcSeasonBonuses has already drawn it by the time this
        // read-only path runs, but that's an invariant enforced only by
        // convention across two files -- guard against it structurally so a
        // future path to isSeasonBonusReady()===true can never turn a GET
        // request into a side-effecting write. Every other bonus category
        // still resolves normally even when the draw hasn't happened yet.
        if (rule.category === 'season_random_finish_position' && peekSeasonRandomBonusPosition(seasonId) == null) {
          return null;
        }
        const winners = resolveSeasonBonusWinners(rule.category, seasonId, { rows, standings });
        const paidDriverIds = paidDriverIdsByCategory.get(rule.category) || new Set();
        const unpaidWinners = winners.filter((driverId) => !paidDriverIds.has(driverId));

        return {
          category: rule.category,
          label: rule.label,
          potCents: categoryPotCents,
          paidCents: categoryPaidCents,
          unallocatedCents: unallocated,
          status: winners.length ? 'unowned_winners' : 'no_winners',
          statusReason: winners.length
            ? (categoryPaidCents > 0
              ? 'Partially distributed; at least one bonus winner had no owner'
              : 'No payout distributed; bonus winner had no owner')
            : 'No driver matched this bonus rule',
          unownedWinners: unpaidWinners.map((driverId) => {
            const driver = driverById.get(driverId);
            return {
              driverCode: driver?.code || null,
              driverName: driver?.name || null,
              teamName: driver?.team_name || null,
            };
          }),
        };
      })
      .filter(Boolean);
  }

  return {
    resolved,
    potCents,
    paidCents,
    unallocatedCents,
    reason: resolved
      ? (unallocatedCents > 0
        ? 'One or more season bonus categories were won by a driver nobody owns.'
        : 'Every season bonus category was paid to an owned driver.')
      : SEASON_BONUS_PENDING_REASON,
    categories,
  };
}

// buildSeasonBonusUnallocated does a full season result/standings scan once
// the season is complete, and stays complete for the rest of that season's
// life. getSeasonUnallocatedHeadline backs the participant dashboard, which
// every participant's client polls every 15-60s, so re-running that scan on
// every single poll (forever, post-season) would recreate the exact cost
// this headline is supposed to avoid. Cache it with a short TTL instead --
// only for this headline path, never for buildSeasonUnallocatedSummary
// below, which an admin reads far less often and should always see fresh
// (e.g. immediately after taking a corrective action).
const SEASON_BONUS_UNALLOCATED_CACHE_TTL_MS = 60_000;
const seasonBonusUnallocatedCache = new Map(); // seasonId -> { computedAt, value }

function getCachedSeasonBonusUnallocatedCents(seasonId) {
  const now = Date.now();
  const cached = seasonBonusUnallocatedCache.get(seasonId);
  if (cached && (now - cached.computedAt) < SEASON_BONUS_UNALLOCATED_CACHE_TTL_MS) {
    return cached.value;
  }
  const value = buildSeasonBonusUnallocated(seasonId).unallocatedCents;
  seasonBonusUnallocatedCache.set(seasonId, { computedAt: now, value });
  return value;
}

/**
 * Headline-only figure for the participant dashboard. Avoids the per-event
 * audit reconstruction so the dashboard poll stays cheap, and caches the
 * season-bonus portion (see getCachedSeasonBonusUnallocatedCents) since that
 * part alone can be an expensive full-season scan once the season is over.
 */
function getSeasonUnallocatedHeadline({ seasonId }) {
  const eventCents = getScoredEventLeakageRows(seasonId)
    .reduce((sum, row) => sum + clampNonNegative(row.pot_cents - row.paid_cents), 0);
  const isFinal = isSeasonBonusReady(seasonId);
  const seasonBonusUnallocatedCents = isFinal ? getCachedSeasonBonusUnallocatedCents(seasonId) : 0;
  return {
    totalCents: eventCents + seasonBonusUnallocatedCents,
    isFinal,
  };
}

/**
 * Full breakdown for the admin Unallocated tab and CSV export.
 */
function buildSeasonUnallocatedSummary({ seasonId }) {
  const leakageRows = getScoredEventLeakageRows(seasonId);
  const { scoringEventCount, scoredEventCount } = getSeasonScoringEventCounts(seasonId);

  let eventCents = 0;
  const contributingEvents = [];
  leakageRows.forEach((row) => {
    const unallocatedCents = clampNonNegative(row.pot_cents - row.paid_cents);
    eventCents += unallocatedCents;
    if (unallocatedCents <= 0) return;
    contributingEvents.push({
      eventId: row.event_id,
      roundNumber: row.round_number,
      name: row.name,
      type: row.type,
      potCents: Number(row.pot_cents || 0),
      paidCents: Number(row.paid_cents || 0),
      unallocatedCents,
      categories: buildEventCategoryBreakdown({ seasonId, eventId: row.event_id }),
    });
  });

  const seasonBonus = buildSeasonBonusUnallocated(seasonId);

  return {
    totalCents: eventCents + seasonBonus.unallocatedCents,
    eventCents,
    seasonBonus,
    contributingEvents,
    isFinal: isSeasonBonusReady(seasonId),
    scoringEventCount,
    scoredEventCount,
    generatedAt: new Date().toISOString(),
  };
}

function formatUnownedWinners(winners) {
  if (!Array.isArray(winners) || !winners.length) return '';
  return winners
    .map((winner) => `${winner.driverName || winner.driverCode || 'Driver'} (${winner.teamName || 'Team N/A'})`)
    .join(' | ');
}

function buildSeasonUnallocatedCsv({ seasonId }) {
  const summary = buildSeasonUnallocatedSummary({ seasonId });

  const rows = [
    ['Season Unallocated Pot'],
    ['Generated At', summary.generatedAt],
    ['Season Scored', `${summary.scoredEventCount}/${summary.scoringEventCount} scoring events`],
    ['Is Final', summary.isFinal ? 'yes' : 'no'],
    ['Event Unallocated Cents', summary.eventCents],
    ['Season Bonus Unallocated Cents', summary.seasonBonus.unallocatedCents],
    ['Season Bonus Resolved', summary.seasonBonus.resolved ? 'yes' : 'no'],
    ['Total Unallocated Cents', summary.totalCents],
    [],
    [
      'Scope',
      'Category',
      'Pot Cents',
      'Paid Cents',
      'Unallocated Cents',
      'Status',
      'Status Reason',
      'Unowned Winners',
    ],
  ];

  summary.contributingEvents.forEach((event) => {
    const scope = `R${event.roundNumber} ${event.name}`;
    if (!event.categories.length) {
      rows.push([scope, '(event total)', event.potCents, event.paidCents, event.unallocatedCents, '', '', '']);
      return;
    }
    event.categories.forEach((category) => {
      rows.push([
        scope,
        category.label || category.category,
        category.potCents,
        category.paidCents,
        category.unallocatedCents,
        category.status,
        category.statusReason,
        formatUnownedWinners(category.unownedWinners),
      ]);
    });
  });

  if (summary.seasonBonus.resolved) {
    (summary.seasonBonus.categories || []).forEach((category) => {
      rows.push([
        'Season Bonus',
        category.label || category.category,
        category.potCents,
        category.paidCents,
        category.unallocatedCents,
        category.status,
        category.statusReason,
        formatUnownedWinners(category.unownedWinners),
      ]);
    });
  } else {
    rows.push(['Season Bonus', '(pending season end)', summary.seasonBonus.potCents, summary.seasonBonus.paidCents, 0, 'pending', summary.seasonBonus.reason, '']);
  }

  return rowsToCsv(rows);
}

module.exports = {
  buildSeasonUnallocatedSummary,
  buildSeasonUnallocatedCsv,
  getSeasonUnallocatedHeadline,
};
