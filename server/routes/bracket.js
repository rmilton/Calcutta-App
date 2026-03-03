const express = require('express');
const {
  db, getActiveTournamentId,
  getGames, getPayoutConfig, getFullStandings,
  getTotalPot, getGameById, getGameByPosition, calculatePayoutAmount,
} = require('../db');
const { requireAuth, requireAdmin } = require('./middleware');
const { streamGameRecap } = require('../ai');

const router = express.Router();

function resolveTid(req) {
  return req.query.t ? parseInt(req.query.t) : getActiveTournamentId();
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

    // Fire-and-forget AI recap
    const winnerTeam = db.prepare('SELECT name, seed, region FROM teams WHERE id = ?').get(winnerId);
    const loserTeam  = db.prepare('SELECT name, seed, region FROM teams WHERE id = ?').get(loserId);
    const winnerOwner = db.prepare(
      'SELECT p.name, o.purchase_price FROM ownership o JOIN participants p ON p.id = o.participant_id WHERE o.team_id = ? AND o.tournament_id = ?'
    ).get(winnerId, tid);
    const loserOwner = db.prepare(
      'SELECT p.name, o.purchase_price FROM ownership o JOIN participants p ON p.id = o.participant_id WHERE o.team_id = ? AND o.tournament_id = ?'
    ).get(loserId, tid);
    const earnings = db.prepare('SELECT amount FROM earnings WHERE game_id = ?').get(gameId)?.amount || 0;
    const totalPot = getTotalPot(tid);
    const standings = getFullStandings(tid).slice(0, 5);

    streamGameRecap({
      roundNumber: game.round,
      winnerTeam,
      loserTeam,
      winnerOwner,
      loserOwner,
      earnings,
      standings,
      totalPot,
    }, io).catch((e) => console.error('[AI recap]', e.message));
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

  let nextGame = getGameByPosition(nextRound, nextRegion, nextPosition, tid);

  if (!nextGame) {
    db.prepare(
      'INSERT INTO games (round, region, position, team1_id, tournament_id) VALUES (?, ?, ?, ?, ?)'
    ).run(nextRound, nextRegion, nextPosition, winnerId, tid);
    return;
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
