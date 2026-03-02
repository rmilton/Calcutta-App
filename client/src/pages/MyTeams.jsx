import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocketEvent } from '../context/SocketContext';
import { useTournament } from '../context/TournamentContext';
import TeamLogo from '../components/TeamLogo';
import { fmt } from '../utils';

const REGION_COLORS = {
  East: '#ef4444',
  West: '#3b82f6',
  South: '#22c55e',
  Midwest: '#f59e0b',
};

const ROUND_NAMES = {
  1: 'Round of 64',
  2: 'Round of 32',
  3: 'Sweet 16',
  4: 'Elite 8',
  5: 'Final Four',
  6: 'Championship',
};

export default function MyTeams() {
  const { participant } = useAuth();
  const { isViewingHistory, apiTParam, refreshKey } = useTournament() ?? {};
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!participant) return;
    fetch(`/api/standings/participant/${participant.id}${apiTParam || ''}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [participant?.id, apiTParam]);

  useEffect(() => { load(); }, [load, refreshKey]);

  useSocketEvent('bracket:update', useCallback(() => { if (!isViewingHistory) load(); }, [load, isViewingHistory]));
  useSocketEvent('auction:sold', useCallback(() => { if (!isViewingHistory) load(); }, [load, isViewingHistory]));
  useSocketEvent('standings:update', useCallback(() => { if (!isViewingHistory) load(); }, [load, isViewingHistory]));

  if (loading) return <div className="flex items-center justify-center min-h-[60vh] text-slate-400">Loading...</div>;

  if (!data || !data.teams?.length) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">🏀</div>
        <h2 className="text-xl font-bold text-white mb-2">No Teams Yet</h2>
        <p className="text-slate-400">You haven't won any teams in the auction yet. Head to the Auction page to bid!</p>
      </div>
    );
  }

  const { teams, totalSpent, totalEarned } = data;
  const net = totalEarned - totalSpent;
  const aliveTeams = teams.filter((t) => !t.eliminated);
  const eliminatedTeams = teams.filter((t) => t.eliminated);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <span
          className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold text-white"
          style={{ backgroundColor: participant?.color }}
        >
          {participant?.name?.[0]?.toUpperCase()}
        </span>
        <div>
          <h1 className="text-xl font-bold text-white">{participant?.name}'s Teams</h1>
          <p className="text-slate-400 text-sm">{teams.length} teams owned · {aliveTeams.length} still alive</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="bg-slate-800 rounded-xl p-4 text-center">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Spent</div>
          <div className="text-2xl font-bold text-white">{fmt(totalSpent)}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 text-center">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Earned</div>
          <div className="text-2xl font-bold text-green-400">{fmt(totalEarned)}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 text-center">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Net</div>
          <div className={`text-2xl font-bold ${net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {net >= 0 ? '+' : '-'}{fmt(Math.abs(net))}
          </div>
        </div>
      </div>

      {/* Active teams */}
      {aliveTeams.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Still Alive ({aliveTeams.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {aliveTeams.map((team) => (
              <TeamCard key={team.id} team={team} />
            ))}
          </div>
        </div>
      )}

      {/* Eliminated teams */}
      {eliminatedTeams.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Eliminated ({eliminatedTeams.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 opacity-50">
            {eliminatedTeams.map((team) => (
              <TeamCard key={team.id} team={team} eliminated />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TeamCard({ team, eliminated }) {
  const color = REGION_COLORS[team.region] || '#6366f1';

  return (
    <div className={`rounded-xl border p-4 ${eliminated ? 'border-slate-700' : 'border-slate-600'}`}
      style={!eliminated ? { borderColor: color + '66' } : {}}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TeamLogo
            espnId={team.espn_id}
            teamColor={team.color}
            name={team.name}
            seed={team.seed}
            size={32}
            eliminated={eliminated}
          />
          <div>
            <div className="text-white font-semibold text-sm">{team.name}</div>
            <div className="text-xs" style={{ color: eliminated ? '#64748b' : color }}>{team.region}</div>
          </div>
        </div>
        {eliminated && (
          <span className="text-xs text-red-500 font-medium">
            {team.eliminated_round ? `Lost – ${ROUND_NAMES[team.eliminated_round]}` : 'Eliminated'}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-sm">
        <div>
          <span className="text-slate-400 text-xs">Paid</span>
          <span className="text-white font-medium ml-1">{fmt(team.purchase_price)}</span>
        </div>
        <div>
          <span className="text-slate-400 text-xs">Earned</span>
          <span className="text-green-400 font-medium ml-1">{fmt(team.earnings)}</span>
        </div>
      </div>
    </div>
  );
}
