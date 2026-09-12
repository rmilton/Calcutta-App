const { splitCentsEvenly } = require('../lib/core');
const {
  db,
  getDrivers,
  getOwnershipBySeason,
} = require('../db');
const { buildEventPayoutAudit } = require('./payoutAuditService');
const { buildSeasonBonusComputation } = require('./payoutRedistributionService');
const {
  isSeasonBonusReady,
  getAllSeasonResultRows,
  getChampionshipStandings,
  resolveSeasonBonusWinners,
} = require('./scoringService');

const SEASON_BONUS_PENDING_REASON =
  'Season bonuses are calculated once every race and sprint has been scored.';

function clampNonNegative(value) {
  const num = Number(value) || 0;
  return num > 0 ? num : 0;
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

function getScoringEventCounts(seasonId) {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'scored' THEN 1 ELSE 0 END) AS scored
    FROM events
    WHERE season_id = ?
      AND type IN ('grand_prix', 'sprint')
      AND status != 'cancelled'
  `).get(seasonId);
  return {
    scoringEventCount: Number(row?.total || 0),
    scoredEventCount: Number(row?.scored || 0),
  };
}

/**
 * Per-category breakdown for the flagged events. Reuses the existing event
 * payout audit so status text and unowned-winner identification stay in one
 * place. Only called for events the cheap query already flagged.
 */
function buildEventCategoryBreakdown({ seasonId, eventId }) {
  const audit = buildEventPayoutAudit({ seasonId, eventId });
  if (!audit) return [];

  return (audit.rules || [])
    .filter((rule) => clampNonNegative(rule.undistributed_cents) > 0)
    .map((rule) => ({
      category: rule.category,
      label: rule.label,
      potCents: Number(rule.category_pot_cents || 0),
      paidCents: Number(rule.distributed_cents || 0),
      unallocatedCents: clampNonNegative(rule.undistributed_cents),
      status: rule.status,
      statusReason: rule.status_reason,
      unownedWinners: (rule.winners || [])
        .filter((winner) => !winner.owner_participant_id)
        .map((winner) => ({
          driverCode: winner.driver_code || null,
          driverName: winner.driver_name || null,
          teamName: winner.team_name || null,
          finishPosition: winner.finish_position ?? null,
        })),
    }));
}

/**
 * Season-bonus leakage. Bonuses only score once the season is complete
 * (isSeasonBonusReady), so until then the whole bonus pool is "pending", not
 * unallocated. After that, any bonus category resolving to an unowned driver
 * is real leakage.
 */
function buildSeasonBonusUnallocated(seasonId) {
  const computation = buildSeasonBonusComputation({ seasonId });
  const potCents = Number(computation.effectiveTotalCents || 0);
  const paidCents = Number(
    db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) AS c
      FROM season_bonus_payouts
      WHERE season_id = ?
    `).get(seasonId)?.c || 0,
  );
  const resolved = isSeasonBonusReady(seasonId);
  const unallocatedCents = resolved ? clampNonNegative(potCents - paidCents) : 0;

  let categories = [];
  if (resolved && computation.rules.length) {
    const rows = getAllSeasonResultRows(seasonId);
    const standings = getChampionshipStandings(seasonId, rows);
    const ownershipMap = new Map(
      getOwnershipBySeason(seasonId).map((o) => [o.driver_id, o.participant_id]),
    );
    const driverById = new Map(getDrivers(seasonId).map((d) => [d.id, d]));

    categories = computation.rules
      .map((rule) => {
        const categoryPotCents = Number(rule.category_pot_cents || 0);
        // Season complete: recalcSeasonBonuses has already drawn/persisted any
        // random position, so this resolver call has no side effect here.
        const winners = resolveSeasonBonusWinners(rule.category, seasonId, { rows, standings });
        if (!winners.length || categoryPotCents <= 0) {
          return {
            category: rule.category,
            label: rule.label,
            potCents: categoryPotCents,
            paidCents: 0,
            unallocatedCents: categoryPotCents > 0 && !winners.length ? categoryPotCents : 0,
            status: winners.length ? 'paid' : 'no_winners',
            statusReason: winners.length
              ? 'Paid to owned winners'
              : 'No driver matched this bonus rule',
            unownedWinners: [],
          };
        }

        const shares = splitCentsEvenly(categoryPotCents, winners.length);
        let paid = 0;
        const unownedWinners = [];
        winners.forEach((driverId, idx) => {
          if (ownershipMap.get(driverId)) {
            paid += shares[idx];
            return;
          }
          const driver = driverById.get(driverId);
          unownedWinners.push({
            driverCode: driver?.code || null,
            driverName: driver?.name || null,
            teamName: driver?.team_name || null,
          });
        });

        const unallocated = clampNonNegative(categoryPotCents - paid);
        return {
          category: rule.category,
          label: rule.label,
          potCents: categoryPotCents,
          paidCents: paid,
          unallocatedCents: unallocated,
          status: unallocated > 0 ? 'unowned_winners' : 'paid',
          statusReason: unallocated > 0
            ? 'At least one bonus winner had no owner'
            : `Paid to ${winners.length} owned winner${winners.length === 1 ? '' : 's'}`,
          unownedWinners,
        };
      })
      .filter((row) => row.unallocatedCents > 0);
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

/**
 * Headline-only figure for the participant dashboard. Avoids the per-event
 * audit reconstruction so the dashboard poll stays cheap.
 */
function getSeasonUnallocatedHeadline({ seasonId }) {
  const eventCents = getScoredEventLeakageRows(seasonId)
    .reduce((sum, row) => sum + clampNonNegative(row.pot_cents - row.paid_cents), 0);
  const seasonBonus = buildSeasonBonusUnallocated(seasonId);
  return {
    totalCents: eventCents + seasonBonus.unallocatedCents,
    isFinal: isSeasonBonusReady(seasonId),
  };
}

/**
 * Full breakdown for the admin Unallocated tab and CSV export.
 */
function buildSeasonUnallocatedSummary({ seasonId }) {
  const leakageRows = getScoredEventLeakageRows(seasonId);
  const { scoringEventCount, scoredEventCount } = getScoringEventCounts(seasonId);

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

function csvCell(value) {
  if (value == null) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
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

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

module.exports = {
  buildSeasonUnallocatedSummary,
  buildSeasonUnallocatedCsv,
  getSeasonUnallocatedHeadline,
};
