const express = require('express');
const {
  db, getActiveTournamentId,
  getTournamentSetting,
  getGames, getPayoutConfig, getFullStandings,
  getTotalPot, getGameById, getGameByPosition, calculatePayoutAmount,
} = require('../db');
const { requireAuth, requireAdmin } = require('./middleware');
const { streamRoundRecap } = require('../ai');
const { getGameSchedule2025 } = require('../data/gameSchedule2025');

const router = express.Router();

function resolveTid(req) {
  return req.query.t ? parseInt(req.query.t) : getActiveTournamentId();
}

function isRoundComplete(roundNumber, tid) {
  const row = db.prepare(`
    SELECT
      COUNT(*) as total_games,
      SUM(CASE WHEN winner_id IS NOT NULL THEN 1 ELSE 0 END) as completed_games
    FROM games
    WHERE tournament_id = ?
      AND round = ?
      AND team1_id IS NOT NULL
      AND team2_id IS NOT NULL
  `).get(tid, roundNumber);

  const totalGames = row?.total_games || 0;
  const completedGames = row?.completed_games || 0;
  return totalGames > 0 && completedGames === totalGames;
}

function getRoundTeamSummaries(roundNumber, tid) {
  const roundGames = db.prepare(`
    SELECT
      g.id as game_id,
      g.position,
      g.winner_id,
      t1.id as team1_id, t1.name as team1_name, t1.seed as team1_seed,
      t2.id as team2_id, t2.name as team2_name, t2.seed as team2_seed,
      p1.name as team1_owner_name, o1.purchase_price as team1_purchase_price,
      p2.name as team2_owner_name, o2.purchase_price as team2_purchase_price
    FROM games g
    LEFT JOIN teams t1 ON t1.id = g.team1_id
    LEFT JOIN teams t2 ON t2.id = g.team2_id
    LEFT JOIN ownership o1 ON o1.team_id = g.team1_id AND o1.tournament_id = g.tournament_id
    LEFT JOIN participants p1 ON p1.id = o1.participant_id
    LEFT JOIN ownership o2 ON o2.team_id = g.team2_id AND o2.tournament_id = g.tournament_id
    LEFT JOIN participants p2 ON p2.id = o2.participant_id
    WHERE g.tournament_id = ?
      AND g.round = ?
      AND g.team1_id IS NOT NULL
      AND g.team2_id IS NOT NULL
    ORDER BY g.position
  `).all(tid, roundNumber);

  const earningsRows = db.prepare(`
    SELECT game_id, amount
    FROM earnings
    WHERE tournament_id = ? AND round_number = ?
  `).all(tid, roundNumber);
  const earningsByGame = new Map(earningsRows.map((r) => [r.game_id, r.amount || 0]));

  const summaries = [];
  for (const game of roundGames) {
    const gameEarnings = earningsByGame.get(game.game_id) || 0;

    if (game.team1_id) {
      const advanced = game.winner_id === game.team1_id;
      summaries.push({
        seed: game.team1_seed,
        teamName: game.team1_name,
        ownerName: game.team1_owner_name || null,
        purchasePrice: game.team1_purchase_price != null ? game.team1_purchase_price : null,
        outcome: advanced ? 'advanced' : 'eliminated',
        roundEarnings: advanced ? gameEarnings : 0,
      });
    }

    if (game.team2_id) {
      const advanced = game.winner_id === game.team2_id;
      summaries.push({
        seed: game.team2_seed,
        teamName: game.team2_name,
        ownerName: game.team2_owner_name || null,
        purchasePrice: game.team2_purchase_price != null ? game.team2_purchase_price : null,
        outcome: advanced ? 'advanced' : 'eliminated',
        roundEarnings: advanced ? gameEarnings : 0,
      });
    }
  }

  return summaries;
}

// GET /api/bracket
router.get('/', requireAuth, (req, res) => {
  const tid = resolveTid(req);
  res.json({
    games: getGames(tid),
    payouts: getPayoutConfig(tid),
  });
});

// POST /api/bracket/result  - admin sets a game result
router.post('/result', requireAdmin, (req, res) => {
  const tid = getActiveTournamentId();
  const { gameId, winnerId } = req.body;
  if (!gameId || !winnerId) return res.status(400).json({ error: 'gameId and winnerId required' });

  const game = getGameById(gameId, tid);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.winner_id) return res.status(400).json({ error: 'Game already has a result' });
  if (winnerId !== game.team1_id && winnerId !== game.team2_id) {
    return res.status(400).json({ error: 'Winner must be one of the two teams' });
  }

  const loserId = winnerId === game.team1_id ? game.team2_id : game.team1_id;

  db.transaction(() => {
    db.prepare('UPDATE games SET winner_id = ?, played_at = unixepoch() WHERE id = ?').run(winnerId, gameId);

    if (loserId) {
      db.prepare('UPDATE teams SET eliminated = 1 WHERE id = ?').run(loserId);
    }

    // Calculate earnings for winner's owner
    const payoutConfig = db.prepare(
      'SELECT * FROM payout_config WHERE round_number = ? AND tournament_id = ?'
    ).get(game.round, tid);
    const payoutAmount = calculatePayoutAmount(payoutConfig, getTotalPot(tid));

    if (payoutAmount > 0) {
      const ownership = db.prepare(
        'SELECT * FROM ownership WHERE team_id = ? AND tournament_id = ?'
      ).get(winnerId, tid);
      if (ownership) {
        db.prepare(
          'INSERT INTO earnings (participant_id, team_id, game_id, round_number, amount, tournament_id) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(ownership.participant_id, winnerId, gameId, game.round, payoutAmount, tid);
      }
    }

    advanceWinner(game, winnerId, tid);
  })();

  const io = req.app.get('io');
  if (io) {
    io.emit('bracket:update', { gameId, winnerId, loserId });

    if (
      getTournamentSetting(tid, 'ai_commentary_end_of_round') !== '0'
      && isRoundComplete(game.round, tid)
    ) {
      const totalPot = getTotalPot(tid);
      const standings = getFullStandings(tid).slice(0, 8);
      const teamSummaries = getRoundTeamSummaries(game.round, tid);

      streamRoundRecap({
        roundNumber: game.round,
        teamSummaries,
        standings,
        totalPot,
      }, io).catch((e) => console.error('[AI recap]', e.message));
    }
  }

  res.json({ ok: true, game: db.prepare('SELECT * FROM games WHERE id = ?').get(gameId) });
});

// POST /api/bracket/unset  - admin removes a game result (undo)
router.post('/unset', requireAdmin, (req, res) => {
  const tid = getActiveTournamentId();
  const { gameId } = req.body;
  const game = getGameById(gameId, tid);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  db.transaction(() => {
    const winnerId = game.winner_id;
    const loserId = winnerId === game.team1_id ? game.team2_id : game.team1_id;

    db.prepare('DELETE FROM earnings WHERE game_id = ?').run(gameId);
    if (loserId) db.prepare('UPDATE teams SET eliminated = 0 WHERE id = ?').run(loserId);
    db.prepare('UPDATE games SET winner_id = NULL, played_at = NULL WHERE id = ?').run(gameId);
    removeFromNextRound(game, winnerId, tid);
  })();

  const io = req.app.get('io');
  if (io) io.emit('bracket:update', { gameId, winnerId: null });

  res.json({ ok: true });
});

// Final Four semifinal pairing: East/West → game 1, South/Midwest → game 2
const FINAL_FOUR_POSITION = { East: 1, West: 1, South: 2, Midwest: 2 };

function getNextGame(game) {
  const nextRound = game.round + 1;
  let nextRegion = game.region;
  let nextPosition = Math.ceil(game.position / 2);

  if (game.round === 4) {
    nextRegion = 'Final Four';
    nextPosition = FINAL_FOUR_POSITION[game.region] || 1;
  } else if (game.round === 5) {
    nextRegion = 'Championship';
    nextPosition = 1;
  }

  return { nextRound, nextRegion, nextPosition };
}

function advanceWinner(game, winnerId, tid) {
  if (game.round >= 6) return;

  const { nextRound, nextRegion, nextPosition } = getNextGame(game);
  const schedule = getGameSchedule2025(nextRound, nextRegion, nextPosition);

  let nextGame = getGameByPosition(nextRound, nextRegion, nextPosition, tid);

  if (!nextGame) {
    db.prepare(
      'INSERT INTO games (round, region, position, team1_id, tipoff_at, tv_network, tournament_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      nextRound, nextRegion, nextPosition, winnerId,
      schedule?.tipoff_at || null,
      schedule?.tv_network || null,
      tid
    );
    return;
  }

  if (schedule && (!nextGame.tipoff_at || !nextGame.tv_network)) {
    db.prepare(`
      UPDATE games
      SET tipoff_at = COALESCE(tipoff_at, ?),
          tv_network = COALESCE(tv_network, ?)
      WHERE id = ?
    `).run(schedule.tipoff_at, schedule.tv_network, nextGame.id);
  }

  if (!nextGame.team1_id) {
    db.prepare('UPDATE games SET team1_id = ? WHERE id = ?').run(winnerId, nextGame.id);
  } else if (!nextGame.team2_id) {
    db.prepare('UPDATE games SET team2_id = ? WHERE id = ?').run(winnerId, nextGame.id);
  }
}

function removeFromNextRound(game, teamId, tid) {
  if (game.round >= 6 || !teamId) return;

  const { nextRound, nextRegion, nextPosition } = getNextGame(game);

  const nextGame = getGameByPosition(nextRound, nextRegion, nextPosition, tid);

  if (!nextGame) return;

  if (nextGame.team1_id === teamId) {
    db.prepare('UPDATE games SET team1_id = NULL WHERE id = ?').run(nextGame.id);
  } else if (nextGame.team2_id === teamId) {
    db.prepare('UPDATE games SET team2_id = NULL WHERE id = ?').run(nextGame.id);
  }
}

module.exports = router;
