import React, { useState, useEffect, useCallback } from 'react';
import { useSocketEvent } from '../context/SocketContext';
import { useTournament } from '../context/TournamentContext';
import { api, REGION_COLORS, ROUND_NAMES_SHORT } from '../utils';



function TeamSlot({ teamName, teamSeed, ownerName, ownerColor, isWinner, isEmpty }) {
  if (isEmpty) {
    return (
      <div className="h-9 flex items-center px-2 rounded-lg bg-surface-input/30 border border-surface-border/50">
        <span className="text-text-muted text-xs">TBD</span>
      </div>
    );
  }

  return (
    <div className={`h-9 flex items-center justify-between px-2 rounded-lg border text-xs transition-all ${
      isWinner
        ? 'bg-status-success/10 border-status-success/40 font-semibold ring-1 ring-status-success/20'
        : 'bg-surface-input/60 border-surface-border'
    }`}>
      <div className="flex items-center gap-1.5 min-w-0">
        {teamSeed && (
          <span className={`shrink-0 tabular-nums ${isWinner ? 'text-status-success' : 'text-text-secondary'}`}>
            #{teamSeed}
          </span>
        )}
        <span className={`truncate ${isWinner ? 'text-text-primary' : 'text-text-primary'}`}>
          {teamName || 'TBD'}
        </span>
      </div>
      {ownerName && (
        <span
          className="shrink-0 ml-1 text-xs font-medium px-1.5 py-0.5 rounded-md"
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
    <div
      className={`rounded-xl border overflow-hidden transition-all duration-150 ${
        hasResult ? 'opacity-75 hover:opacity-90' : 'hover:shadow-md'
      }`}
      style={{ borderColor: hasResult ? '#334155' : color + '55' }}
    >
      {/* Game header */}
      <div className="px-2 py-0.5 text-xs text-text-secondary flex items-center justify-between"
        style={{ backgroundColor: color + '15' }}>
        <span className="font-medium" style={{ color: color + 'cc' }}>{game.region}</span>
        {hasResult && (
          <>
            <span aria-hidden="true" className="text-status-success">✓</span>
            <span className="sr-only">Game complete</span>
          </>
        )}
      </div>
      <div className="p-1 bg-surface-raised/60 space-y-0.5">
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
    <div className="card p-4">
      {/* Region header with color-accent left border */}
      <h3
        className="text-sm font-bold uppercase tracking-wider mb-4 pl-3"
        style={{ color, borderLeft: `4px solid ${color}` }}
      >
        {region} Region
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {[1, 2, 3, 4].map((round) => {
          const roundGames = byRound[round] || [];
          return (
            <div key={round} className="shrink-0 min-w-[160px]">
              <div className="section-label text-center mb-2">
                {ROUND_NAMES_SHORT[round]}
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
    api(`/bracket${apiTParam || ''}`)
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

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8" role="status" aria-label="Loading bracket">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
          <div className="skeleton h-64 w-full" />
          <div className="skeleton h-64 w-full" />
          <div className="skeleton h-64 w-full" />
          <div className="skeleton h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!initialized) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}>
            <span aria-hidden="true" className="text-3xl leading-none">🏆</span>
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">Tournament Not Started</h2>
          <p className="text-text-secondary">The admin will initialize the bracket once the auction is complete.</p>
        </div>
      </div>
    );
  }

  const regionGames = {};
  for (const region of ['East', 'West', 'South', 'Midwest']) {
    regionGames[region] = games.filter((g) => g.region === region);
  }

  const finalFour = games.filter((g) => g.region === 'Final Four');
  const championship = games.filter((g) => g.region === 'Championship');

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-text-primary mb-6">Tournament Bracket</h1>

      {/* Regional brackets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {['East', 'West', 'South', 'Midwest'].map((region) => (
          <RegionBracket key={region} region={region} games={regionGames[region] || []} />
        ))}
      </div>

      {/* Final Weekend */}
      {(finalFour.length > 0 || championship.length > 0) && (
        <div className="card-elevated ring-1 ring-brand/20 p-6">
          <h3 className="section-label text-brand mb-4">Final Weekend</h3>
          <div className="flex gap-6 flex-wrap">
            {finalFour.length > 0 && (
              <div>
                <div className="section-label mb-2">Final Four</div>
                <div className="space-y-2">
                  {finalFour.map((g) => <GameCard key={g.id} game={g} />)}
                </div>
              </div>
            )}
            {championship.length > 0 && (
              <div>
                <div className="section-label mb-2">Championship</div>
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
