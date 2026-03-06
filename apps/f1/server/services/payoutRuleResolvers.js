function winnersByFinish(rows, targetPosition) {
  return rows
    .filter((row) => row.finish_position === targetPosition)
    .map((row) => row.driver_id);
}

function bestFinisherAtOrBelow(rows, floorPosition) {
  const eligible = rows.filter((row) => row.finish_position >= floorPosition);
  if (!eligible.length) {
    return { winnerDriverIds: [], targetFinishPosition: null };
  }
  const bestFinish = Math.min(...eligible.map((row) => row.finish_position));
  return {
    winnerDriverIds: eligible
      .filter((row) => row.finish_position === bestFinish)
      .map((row) => row.driver_id),
    targetFinishPosition: bestFinish,
  };
}

function mostPositionsGained(rows, denseRank) {
  if (!rows.length) {
    return { winnerDriverIds: [], targetGain: null };
  }
  const values = [...new Set(rows.map((row) => Number(row.positions_gained) || 0))].sort((a, b) => b - a);
  const targetGain = values[denseRank - 1];
  if (targetGain == null) {
    return { winnerDriverIds: [], targetGain: null };
  }
  return {
    winnerDriverIds: rows
      .filter((row) => (Number(row.positions_gained) || 0) === targetGain)
      .map((row) => row.driver_id),
    targetGain,
  };
}

function slowestPitStop(rows) {
  const eligible = rows.filter((row) => Number.isFinite(Number(row.slowest_pit_stop_seconds)) && Number(row.slowest_pit_stop_seconds) > 0);
  if (!eligible.length) {
    return { winnerDriverIds: [], targetDuration: null };
  }
  const targetDuration = Math.max(...eligible.map((row) => Number(row.slowest_pit_stop_seconds)));
  return {
    winnerDriverIds: eligible
      .filter((row) => Number(row.slowest_pit_stop_seconds) === targetDuration)
      .map((row) => row.driver_id),
    targetDuration,
  };
}

function randomPositionWinners(rows, randomPosition) {
  if (!randomPosition) return [];
  return rows
    .filter((row) => row.finish_position === randomPosition)
    .map((row) => row.driver_id);
}

function evaluateCategoryRule({ category, rows, event, rankOrder = 1 }) {
  switch (category) {
    case 'race_winner':
    case 'sprint_winner':
      return {
        winnerDriverIds: winnersByFinish(rows, 1),
        criteriaText: 'Finish position = 1',
        resolution: {
          metric: 'finish_position',
          target_value: 1,
          note: 'Winner resolved from event results',
        },
      };
    case 'second_place':
      return {
        winnerDriverIds: winnersByFinish(rows, 2),
        criteriaText: 'Finish position = 2',
        resolution: {
          metric: 'finish_position',
          target_value: 2,
          note: 'Winner resolved from event results',
        },
      };
    case 'third_place':
      return {
        winnerDriverIds: winnersByFinish(rows, 3),
        criteriaText: 'Finish position = 3',
        resolution: {
          metric: 'finish_position',
          target_value: 3,
          note: 'Winner resolved from event results',
        },
      };
    case 'best_p6_or_lower': {
      const bestP6 = bestFinisherAtOrBelow(rows, 6);
      return {
        winnerDriverIds: bestP6.winnerDriverIds,
        criteriaText: 'Best finisher at P6 or lower',
        resolution: {
          metric: 'best_finish_at_or_below',
          target_value: bestP6.targetFinishPosition,
          note: 'Best (lowest) finisher among drivers at P6+',
        },
      };
    }
    case 'best_p11_or_lower': {
      const bestP11 = bestFinisherAtOrBelow(rows, 11);
      return {
        winnerDriverIds: bestP11.winnerDriverIds,
        criteriaText: 'Best finisher at P11 or lower',
        resolution: {
          metric: 'best_finish_at_or_below',
          target_value: bestP11.targetFinishPosition,
          note: 'Best (lowest) finisher among drivers at P11+',
        },
      };
    }
    case 'most_positions_gained': {
      const mostGain = mostPositionsGained(rows, 1);
      return {
        winnerDriverIds: mostGain.winnerDriverIds,
        criteriaText: 'Highest positions gained',
        resolution: {
          metric: 'positions_gained',
          target_value: mostGain.targetGain,
          note: 'Highest positions_gained across event results',
        },
      };
    }
    case 'slowest_pit_stop': {
      const slowestPit = slowestPitStop(rows);
      return {
        winnerDriverIds: slowestPit.winnerDriverIds,
        criteriaText: 'Slowest recorded pit stop',
        resolution: {
          metric: 'slowest_pit_stop_seconds',
          target_value: slowestPit.targetDuration,
          note: 'Highest OpenF1 stop_duration recorded for a driver in this event',
        },
      };
    }
    case 'second_most_positions_gained': {
      const secondMostGain = mostPositionsGained(rows, rankOrder || 2);
      return {
        winnerDriverIds: secondMostGain.winnerDriverIds,
        criteriaText: 'Second-highest positions gained',
        resolution: {
          metric: 'positions_gained',
          target_value: secondMostGain.targetGain,
          note: 'Second-highest dense rank of positions_gained',
        },
      };
    }
    case 'random_finish_bonus':
      return {
        winnerDriverIds: randomPositionWinners(rows, event?.random_bonus_position),
        criteriaText: 'Randomly drawn finishing position',
        resolution: {
          metric: 'finish_position',
          target_value: Number(event?.random_bonus_position) || null,
          note: 'Winner matched event random bonus position',
        },
      };
    default:
      return {
        winnerDriverIds: [],
        criteriaText: 'Unsupported category',
        resolution: {
          metric: 'unsupported',
          target_value: null,
          note: 'No resolver configured for this category',
        },
      };
  }
}

function resolveCategoryWinners(category, rows, event, rankOrder = 1) {
  return evaluateCategoryRule({ category, rows, event, rankOrder }).winnerDriverIds;
}

module.exports = {
  winnersByFinish,
  bestFinisherAtOrBelow,
  mostPositionsGained,
  slowestPitStop,
  randomPositionWinners,
  resolveCategoryWinners,
  evaluateCategoryRule,
};
