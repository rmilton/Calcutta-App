import React, { useState, useEffect } from 'react';
import { api, fmtGameMeta, ROUND_NAMES } from '../../utils';

function GameRow({ game, onSetWinner, onUnset }) {
  const hasResult = !!game.winner_id;
  const gameMeta = fmtGameMeta(game.tipoff_at, game.tv_network);

  if (!game.team1_id && !game.team2_id) return null;

  return (
    <div className={`bg-slate-800 rounded-lg p-3 ${hasResult ? 'opacity-70' : ''}`}>
      <div className="text-xs text-slate-500 mb-2">{game.region} · R{game.round} G{game.position}</div>
      {gameMeta && (
        <div className="text-[11px] text-slate-400 mb-2">{gameMeta}</div>
      )}
      <div className="space-y-1.5">
        {[
          { id: game.team1_id, name: game.team1_name, seed: game.team1_seed, owner: game.team1_owner_name, color: game.team1_owner_color },
          { id: game.team2_id, name: game.team2_name, seed: game.team2_seed, owner: game.team2_owner_name, color: game.team2_owner_color },
        ].filter((t) => t.id).map((team) => {
          const isWinner = game.winner_id === team.id;
          return (
            <button
              key={team.id}
              onClick={() => hasResult ? null : onSetWinner(game.id, team.id)}
              disabled={hasResult}
              className={`w-full flex items-center justify-between px-3 py-2 rounded transition-colors text-left ${
                isWinner
                  ? 'bg-green-800 border border-green-600'
                  : hasResult
                  ? 'bg-slate-700 opacity-50'
                  : 'bg-slate-700 hover:bg-slate-600 cursor-pointer'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-xs">#{team.seed}</span>
                <span className="text-white text-sm font-medium">{team.name}</span>
                {team.owner && (
                  <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ color: team.color, backgroundColor: team.color + '22' }}>
                    {team.owner}
                  </span>
                )}
              </div>
              {isWinner && <span className="text-green-400 text-xs font-bold">WIN</span>}
            </button>
          );
        })}
      </div>
      {hasResult && (
        <button onClick={() => onUnset(game.id)} className="mt-2 text-xs text-slate-500 hover:text-red-400 transition-colors">
          ↩ Undo result
        </button>
      )}
    </div>
  );
}

export default function BracketAdminTab() {
  const [games, setGames] = useState([]);
  const [tournamentStarted, setTournamentStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [expandedRounds, setExpandedRounds] = useState({});

  const buildGamesByRound = (allGames) => {
    const byRound = {};
    for (const g of allGames) {
      if (!byRound[g.round]) byRound[g.round] = [];
      byRound[g.round].push(g);
    }
    return byRound;
  };

  const roundHasUndecidedGames = (roundGames) =>
    roundGames.some((g) => g.team1_id && g.team2_id && !g.winner_id);

  const load = () => {
    Promise.all([
      api('/bracket').then((r) => r.json()),
      api('/admin/settings').then((r) => r.json()),
    ]).then(([bracketData, settings]) => {
      const nextGames = bracketData.games || [];
      const grouped = buildGamesByRound(nextGames);

      setGames(nextGames);
      setTournamentStarted(settings.tournament_started === '1');
      setExpandedRounds((prev) => {
        const next = {};
        for (const [round, roundGames] of Object.entries(grouped)) {
          const defaultExpanded = roundHasUndecidedGames(roundGames);
          next[round] = prev[round] ?? defaultExpanded;
        }
        return next;
      });
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const flashMsg = (text) => { setMsg(text); setTimeout(() => setMsg(''), 3000); };

  const initBracket = async () => {
    const r = await api('/admin/bracket/initialize', { method: 'POST' });
    const data = await r.json();
    if (!r.ok) { flashMsg(data.error); return; }
    flashMsg('Bracket initialized!');
    load();
  };

  const resetBracket = async () => {
    if (!confirm('Reset all game results? This cannot be undone.')) return;
    await api('/admin/bracket/reset', { method: 'POST' });
    flashMsg('Bracket reset');
    load();
  };

  const setWinner = async (gameId, winnerId) => {
    const r = await api('/bracket/result', { method: 'POST', body: JSON.stringify({ gameId, winnerId }) });
    const data = await r.json();
    if (!r.ok) { flashMsg(data.error); return; }
    load();
  };

  const unsetWinner = async (gameId) => {
    await api('/bracket/unset', { method: 'POST', body: JSON.stringify({ gameId }) });
    load();
  };

  if (loading) return <div className="text-slate-400 py-8 text-center">Loading...</div>;

  const gamesByRound = buildGamesByRound(games);
  const roundEntries = Object.entries(gamesByRound).sort((a, b) => Number(a[0]) - Number(b[0]));
  const allExpanded = roundEntries.length > 0 && roundEntries.every(([round]) => !!expandedRounds[round]);
  const toggleAllRounds = () => {
    const nextExpanded = !allExpanded;
    setExpandedRounds((prev) => {
      const next = { ...prev };
      for (const [round] of roundEntries) next[round] = nextExpanded;
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center">
        {!tournamentStarted ? (
          <button onClick={initBracket} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2 rounded-lg">
            Initialize Bracket
          </button>
        ) : (
          <>
            <button
              onClick={toggleAllRounds}
              className="bg-slate-700 hover:bg-slate-600 text-white font-semibold px-4 py-2 rounded-lg"
            >
              {allExpanded ? 'Collapse All Rounds' : 'Expand All Rounds'}
            </button>
            <button onClick={resetBracket} className="bg-red-700 hover:bg-red-800 text-white font-bold px-5 py-2 rounded-lg">
              Reset All Results
            </button>
          </>
        )}
        {msg && <span className="text-green-400 text-sm">{msg}</span>}
      </div>

      {!tournamentStarted ? (
        <p className="text-slate-400">Initialize the bracket to start entering results.</p>
      ) : (
        <div className="space-y-8">
          {roundEntries.map(([round, roundGames]) => {
            const unresolvedCount = roundGames.filter((g) => g.team1_id && g.team2_id && !g.winner_id).length;
            const isExpanded = !!expandedRounds[round];
            return (
              <div key={round} className="border border-slate-700 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedRounds((prev) => ({ ...prev, [round]: !prev[round] }))}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-900/70 hover:bg-slate-800/70 transition-colors text-left"
                  aria-expanded={isExpanded}
                >
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-orange-400">
                      {ROUND_NAMES[parseInt(round, 10)]}
                    </h3>
                    {unresolvedCount > 0 && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-amber-400/15 text-amber-300 border border-amber-500/30">
                        {unresolvedCount} undecided
                      </span>
                    )}
                  </div>
                  <span className="text-slate-300 text-xs">{isExpanded ? 'Hide' : 'Show'}</span>
                </button>

                {isExpanded && (
                  <div className="p-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {roundGames.map((game) => (
                        <GameRow key={game.id} game={game} onSetWinner={setWinner} onUnset={unsetWinner} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
