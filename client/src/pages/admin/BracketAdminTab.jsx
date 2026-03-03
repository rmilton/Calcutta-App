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

  const load = () => {
    Promise.all([
      api('/bracket').then((r) => r.json()),
      api('/admin/settings').then((r) => r.json()),
    ]).then(([bracketData, settings]) => {
      setGames(bracketData.games || []);
      setTournamentStarted(settings.tournament_started === '1');
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

  const gamesByRound = {};
  for (const g of games) {
    if (!gamesByRound[g.round]) gamesByRound[g.round] = [];
    gamesByRound[g.round].push(g);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center">
        {!tournamentStarted ? (
          <button onClick={initBracket} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2 rounded-lg">
            Initialize Bracket
          </button>
        ) : (
          <button onClick={resetBracket} className="bg-red-700 hover:bg-red-800 text-white font-bold px-5 py-2 rounded-lg">
            Reset All Results
          </button>
        )}
        {msg && <span className="text-green-400 text-sm">{msg}</span>}
      </div>

      {!tournamentStarted ? (
        <p className="text-slate-400">Initialize the bracket to start entering results.</p>
      ) : (
        <div className="space-y-8">
          {Object.entries(gamesByRound).map(([round, roundGames]) => (
            <div key={round}>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-orange-400 mb-3">
                {ROUND_NAMES[parseInt(round)]}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {roundGames.map((game) => (
                  <GameRow key={game.id} game={game} onSetWinner={setWinner} onUnset={unsetWinner} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
