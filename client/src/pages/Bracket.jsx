import React, { useState, useEffect, useCallback } from 'react';
import { useSocketEvent } from '../context/SocketContext';
import { useTournament } from '../context/TournamentContext';

const REGION_COLORS = {
  East: '#ef4444',
  West: '#3b82f6',
  South: '#22c55e',
  Midwest: '#f59e0b',
};

const ROUND_NAMES = ['R64', 'R32', 'S16', 'E8', 'F4', 'Champ'];

function TeamSlot({ teamName, teamSeed, ownerName, ownerColor, isWinner, isEmpty }) {
  if (isEmpty) {
    return (
      <div className="h-9 flex items-center px-2 rounded bg-slate-700/30 border border-slate-700/50">
        <span className="text-text-muted text-xs">TBD</span>
      </div>
    );
  }

  return (
    <div className={`h-9 flex items-center justify-between px-2 rounded border text-xs transition-all ${
      isWinner
        ? 'bg-green-900/60 border-green-700 font-semibold'
        : 'bg-slate-700/60 border-slate-600'
    }`}>
      <div className="flex items-center gap-1.5 min-w-0">
        {teamSeed && <span className={`shrink-0 ${isWinner ? 'text-green-400' : 'text-slate-400'}`}>#{teamSeed}</span>}
        <span className={`truncate ${isWinner ? 'text-white' : 'text-slate-200'}`}>{teamName || 'TBD'}</span>
      </div>
      {ownerName && (
        <span
          className="shrink-0 ml-1 text-xs font-medium px-1.5 py-0.5 rounded"
          style={{ color: ownerColor, backgroundColor: ownerColor + '22' }}
        >
          {ownerName}
        </span>
      )}
    </div>
  );
}

function GameCard({ game }) {
  const hasResult = !!game.winner_id;
  const color = REGION_COLORS[game.region] || '#6366f1';

  return (
    <div className={`rounded-lg border overflow-hidden ${hasResult ? 'opacity-90' : ''}`}
      style={{ borderColor: hasResult ? '#374151' : color + '44' }}>
      <div className="px-2 py-0.5 text-xs text-text-secondary bg-slate-800/80 flex items-center justify-between">
        <span>{game.region}</span>
        {hasResult && (
          <>
            <span aria-hidden="true" className="text-green-500">✓</span>
            <span className="sr-only">Game complete</span>
          </>
        )}
      </div>
      <div className="p-1 bg-slate-800/50 space-y-0.5">
        <TeamSlot
          teamName={game.team1_name} teamSeed={game.team1_seed}
          ownerName={game.team1_owner_name} ownerColor={game.team1_owner_color}
          isWinner={game.winner_id === game.team1_id}
          isEmpty={!game.team1_id}
        />
        <TeamSlot
          teamName={game.team2_name} teamSeed={game.team2_seed}
          ownerName={game.team2_owner_name} ownerColor={game.team2_owner_color}
          isWinner={game.winner_id === game.team2_id}
          isEmpty={!game.team2_id}
        />
      </div>
    </div>
  );
}

function RegionBracket({ region, games }) {
  const color = REGION_COLORS[region];
  const byRound = {};
  for (const g of games) {
    if (!byRound[g.round]) byRound[g.round] = [];
    byRound[g.round].push(g);
  }

  return (
    <div className="bg-slate-800/50 rounded-xl p-4">
      <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color }}>
        {region} Region
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {[1, 2, 3, 4].map((round) => {
          const roundGames = byRound[round] || [];
          return (
            <div key={round} className="shrink-0 min-w-[160px]">
              <div className="text-xs text-text-secondary uppercase tracking-wider text-center mb-2">
                {ROUND_NAMES[round - 1]}
              </div>
              <div className="space-y-2">
                {roundGames.map((g) => <GameCard key={g.id} game={g} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Bracket() {
  const { isViewingHistory, apiTParam, refreshKey } = useTournament() ?? {};
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const loadGames = useCallback(() => {
    fetch(`/api/bracket${apiTParam || ''}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        setGames(data.games || []);
        setInitialized((data.games || []).length > 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [apiTParam]);

  useEffect(() => { loadGames(); }, [loadGames, refreshKey]);

  const handleBracketUpdate = useCallback(() => {
    if (!isViewingHistory) loadGames();
  }, [loadGames, isViewingHistory]);

  useSocketEvent('bracket:update', handleBracketUpdate);
  useSocketEvent('bracket:initialized', handleBracketUpdate);

  if (loading) return <div className="flex items-center justify-center min-h-[60vh] text-slate-400">Loading...</div>;

  if (!initialized) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">🏆</div>
        <h2 className="text-xl font-bold text-white mb-2">Tournament Not Started</h2>
        <p className="text-slate-400">The admin will initialize the bracket once the auction is complete.</p>
      </div>
    );
  }

  const regionGames = {};
  const finalGames = games.filter((g) => ['Final Four', 'Championship'].includes(g.region));
  for (const region of ['East', 'West', 'South', 'Midwest']) {
    regionGames[region] = games.filter((g) => g.region === region);
  }

  const finalFour = games.filter((g) => g.region === 'Final Four');
  const championship = games.filter((g) => g.region === 'Championship');

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Tournament Bracket</h1>

      {/* Regional brackets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {['East', 'West', 'South', 'Midwest'].map((region) => (
          <RegionBracket key={region} region={region} games={regionGames[region] || []} />
        ))}
      </div>

      {/* Final Four + Championship */}
      {(finalFour.length > 0 || championship.length > 0) && (
        <div className="bg-slate-800/50 rounded-xl p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-orange-400 mb-4">Final Weekend</h3>
          <div className="flex gap-6 flex-wrap">
            {finalFour.length > 0 && (
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Final Four</div>
                <div className="space-y-2">
                  {finalFour.map((g) => <GameCard key={g.id} game={g} />)}
                </div>
              </div>
            )}
            {championship.length > 0 && (
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Championship</div>
                <div className="space-y-2">
                  {championship.map((g) => <GameCard key={g.id} game={g} />)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
