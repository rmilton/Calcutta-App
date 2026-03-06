const {
  amountFromBps,
  splitCentsEvenly,
} = require('../lib/core');
const {
  getEventById,
  getEventResults,
  getEventPayoutRules,
  getEventPayouts,
  getOwnershipBySeason,
  getSeasonParticipants,
  getTotalPotCents,
} = require('../db');
const { evaluateCategoryRule } = require('./payoutRuleResolvers');

function pctOfPot(cents, totalPotCents) {
  const total = Number(totalPotCents || 0);
  if (total <= 0) return 0;
  return (Number(cents || 0) / total) * 100;
}

function payoutStatus({ hasResults, winnerCount, distributedCents, undistributedCents }) {
  if (!hasResults) {
    return {
      status: 'pending_results',
      statusReason: 'No event results loaded yet',
    };
  }

  if (!winnerCount) {
    return {
      status: 'no_winners',
      statusReason: 'No driver matched this rule in event results',
    };
  }

  if (undistributedCents > 0) {
    if (distributedCents > 0) {
      return {
        status: 'unowned_winners',
        statusReason: 'Partially distributed; at least one winner had no owner',
      };
    }
    return {
      status: 'unowned_winners',
      statusReason: 'No payout distributed; winners had no owner',
    };
  }

  return {
    status: 'paid',
    statusReason: `Paid to ${winnerCount} owned winner${winnerCount === 1 ? '' : 's'}`,
  };
}

function buildEventPayoutAudit({ seasonId, eventId }) {
  const event = getEventById(seasonId, eventId);
  if (!event) return null;

  const results = getEventResults(eventId);
  const rules = getEventPayoutRules(seasonId, event.type);
  const payouts = getEventPayouts(seasonId, eventId);
  const totalPotCents = getTotalPotCents(seasonId);

  const ownershipRows = getOwnershipBySeason(seasonId);
  const participants = getSeasonParticipants(seasonId);

  const participantById = new Map((participants || []).map((participant) => [participant.id, participant]));
  const ownerByDriverId = new Map((ownershipRows || []).map((row) => [row.driver_id, row.participant_id]));
  const resultByDriverId = new Map((results || []).map((row) => [row.driver_id, row]));
  const payoutByWinnerKey = new Map(
    (payouts || []).map((payout) => [
      `${payout.category}::${payout.driver_id}::${payout.participant_id}`,
      payout,
    ])
  );

  const hasResults = (results || []).length > 0;
  let distributedTotalCents = 0;
  let undistributedTotalCents = 0;

  const auditedRules = (rules || []).map((rule) => {
    const categoryPotCents = amountFromBps(totalPotCents, rule.bps);
    const evaluation = evaluateCategoryRule({
      category: rule.category,
      rows: results,
      event,
      rankOrder: rule.rank_order,
    });

    const winnerDriverIds = evaluation.winnerDriverIds || [];
    const shares = splitCentsEvenly(categoryPotCents, winnerDriverIds.length);

    let distributedCents = 0;
    const winners = winnerDriverIds.map((driverId, winnerIndex) => {
      const row = resultByDriverId.get(driverId) || null;
      const ownerParticipantId = ownerByDriverId.get(driverId) || null;
      const ownerParticipant = ownerParticipantId ? participantById.get(ownerParticipantId) : null;
      const splitShareCents = shares[winnerIndex] || 0;

      const payoutRecord = ownerParticipantId
        ? payoutByWinnerKey.get(`${rule.category}::${driverId}::${ownerParticipantId}`)
        : null;

      const receivedCents = ownerParticipantId ? Number(payoutRecord?.amount_cents || 0) : 0;
      distributedCents += receivedCents;

      return {
        driver_id: driverId,
        driver_code: row?.driver_code || null,
        driver_name: row?.driver_name || null,
        team_name: row?.team_name || null,
        driver_active: row?.driver_active ?? 1,
        finish_position: row?.finish_position ?? null,
        start_position: row?.start_position ?? null,
        positions_gained: row?.positions_gained ?? null,
        slowest_pit_stop_seconds: row?.slowest_pit_stop_seconds ?? null,
        owner_participant_id: ownerParticipantId,
        owner_participant_name: ownerParticipant?.name || null,
        split_share_cents: splitShareCents,
        received_cents: receivedCents,
      };
    });

    const undistributedCents = Math.max(0, Number(categoryPotCents || 0) - distributedCents);
    distributedTotalCents += distributedCents;
    undistributedTotalCents += undistributedCents;

    const status = payoutStatus({
      hasResults,
      winnerCount: winners.length,
      distributedCents,
      undistributedCents,
    });

    return {
      rule_id: rule.id,
      category: rule.category,
      label: rule.label,
      bps: Number(rule.bps) || 0,
      rank_order: Number(rule.rank_order) || 1,
      criteria_text: evaluation.criteriaText,
      category_pot_cents: categoryPotCents,
      category_pct_of_pot: pctOfPot(categoryPotCents, totalPotCents),
      resolution: evaluation.resolution,
      winner_count: winners.length,
      winners,
      distributed_cents: distributedCents,
      undistributed_cents: undistributedCents,
      status: status.status,
      status_reason: status.statusReason,
    };
  });

  return {
    event_id: event.id,
    event_type: event.type,
    has_results: hasResults,
    total_pot_cents: totalPotCents,
    random_bonus_position: event.random_bonus_position || null,
    rules: auditedRules,
    totals: {
      distributed_cents: distributedTotalCents,
      undistributed_cents: undistributedTotalCents,
    },
  };
}

function csvCell(value) {
  if (value == null) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function formatWinnerSummary(winners) {
  if (!Array.isArray(winners) || winners.length === 0) return 'No winners';
  return winners.map((winner) => {
    const owner = winner.owner_participant_name || 'Unowned';
    const finish = winner.finish_position ?? 'N/A';
    const start = winner.start_position ?? 'N/A';
    const gain = winner.positions_gained ?? 'N/A';
    const stop = Number(winner.slowest_pit_stop_seconds);
    const stopText = Number.isFinite(stop) && stop > 0 ? `, slowest stop ${stop.toFixed(3)}s` : '';
    return `${winner.driver_name || winner.driver_code || 'Driver'} (${winner.team_name || 'Team N/A'}) - owner ${owner}, finish ${finish}, start ${start}, gain ${gain}${stopText}, received ${winner.received_cents}`;
  }).join(' | ');
}

function buildEventPayoutAuditCsv({ seasonId, eventId }) {
  const event = getEventById(seasonId, eventId);
  const audit = buildEventPayoutAudit({ seasonId, eventId });
  if (!event || !audit) return null;

  const rows = [
    ['Event Name', event.name],
    ['Event Type', event.type],
    ['Total Pot Cents', audit.total_pot_cents],
    ['Random Bonus Position', audit.random_bonus_position || ''],
    ['Has Results', audit.has_results ? 'yes' : 'no'],
    [],
    [
      'Rule Label',
      'Category',
      'BPS',
      'Percent Of Pot',
      'Rule Pot Cents',
      'Winner Count',
      'Status',
      'Status Reason',
      'Distributed Cents',
      'Undistributed Cents',
      'Resolution Metric',
      'Resolution Target',
      'Winner Summary',
    ],
    ...(audit.rules || []).map((rule) => [
      rule.label || rule.category,
      rule.category,
      rule.bps,
      rule.category_pct_of_pot,
      rule.category_pot_cents,
      rule.winner_count,
      rule.status,
      rule.status_reason,
      rule.distributed_cents,
      rule.undistributed_cents,
      rule.resolution?.metric || '',
      rule.resolution?.target_value ?? '',
      formatWinnerSummary(rule.winners),
    ]),
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function buildEventPayoutAuditWinnerCsv({ seasonId, eventId }) {
  const event = getEventById(seasonId, eventId);
  const audit = buildEventPayoutAudit({ seasonId, eventId });
  if (!event || !audit) return null;

  const rows = [
    ['Event Name', event.name],
    ['Event Type', event.type],
    ['Total Pot Cents', audit.total_pot_cents],
    ['Random Bonus Position', audit.random_bonus_position || ''],
    [],
    [
      'Rule Label',
      'Category',
      'Rule Pot Cents',
      'Rule Status',
      'Driver Name',
      'Driver Code',
      'Team Name',
      'Driver Active',
      'Owner Participant',
      'Finish Position',
      'Start Position',
      'Positions Gained',
      'Slowest Pit Stop Seconds',
      'Split Share Cents',
      'Received Cents',
      'Undistributed Cents',
    ],
  ];

  (audit.rules || []).forEach((rule) => {
    if (!rule.winners?.length) {
      rows.push([
        rule.label || rule.category,
        rule.category,
        rule.category_pot_cents,
        rule.status,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        0,
        0,
        rule.undistributed_cents,
      ]);
      return;
    }

    rule.winners.forEach((winner) => {
      rows.push([
        rule.label || rule.category,
        rule.category,
        rule.category_pot_cents,
        rule.status,
        winner.driver_name || '',
        winner.driver_code || '',
        winner.team_name || '',
        winner.driver_active ?? '',
        winner.owner_participant_name || 'Unowned',
        winner.finish_position ?? '',
        winner.start_position ?? '',
        winner.positions_gained ?? '',
        winner.slowest_pit_stop_seconds ?? '',
        winner.split_share_cents ?? 0,
        winner.received_cents ?? 0,
        rule.undistributed_cents ?? 0,
      ]);
    });
  });

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

module.exports = {
  buildEventPayoutAudit,
  buildEventPayoutAuditCsv,
  buildEventPayoutAuditWinnerCsv,
};
