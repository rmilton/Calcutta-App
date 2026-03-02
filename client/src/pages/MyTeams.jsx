import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocketEvent } from '../context/SocketContext';
import { useTournament } from '../context/TournamentContext';
import TeamLogo from '../components/TeamLogo';
import { fmt } from '../utils';

const REGION_COLORS = {
  East:    '#ef4444',
  West:    '#3b82f6',
  South:   '#22c55e',
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

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8" role="status" aria-label="Loading your teams">
        <div className="space-y-3 animate-fade-in">
          <div className="skeleton h-16 w-full" />
          <div className="skeleton h-28 w-full" />
          <div className="skeleton h-40 w-full" />
        </div>
      </div>
    );
  }

  if (!data || !data.teams?.length) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}>
            <span aria-hidden="true" className="text-3xl leading-none">🏀</span>
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">No Teams Yet</h2>
          <p className="text-text-secondary">You haven't won any teams in the auction yet. Head to the Auction page to bid!</p>
        </div>
      </div>
    );
  }

  const { teams, totalSpent, totalEarned } = data;
  const net = totalEarned - totalSpent;
  const aliveTeams = teams.filter((t) => !t.eliminated);
  const eliminatedTeams = teams.filter((t) => t.eliminated);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold text-white ring-2 ring-surface-border"
          style={{ backgroundColor: participant?.color }}
          aria-hidden="true"
        >
          {participant?.name?.[0]?.toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">{participant?.name}'s Teams</h1>
          <p className="text-text-secondary text-sm">{teams.length} teams owned · {aliveTeams.length} still alive</p>
        </div>
      </div>

      {/* ── Summary stat cards ── */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="card p-4 text-center">
          <div className="section-label mb-1">Spent</div>
          <div className="text-2xl font-bold text-text-primary tabular-nums">{fmt(totalSpent)}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="section-label mb-1">Earned</div>
          <div className="text-2xl font-bold text-status-success tabular-nums">{fmt(totalEarned)}</div>
        </div>
        <div className={`card p-4 text-center ${
          net >= 0 ? 'ring-1 ring-status-success/30' : 'ring-1 ring-status-error/30'
        }`}
          style={{ backgroundColor: net >= 0 ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.06)' }}>
          <div className="section-label mb-1">Net</div>
          <div className={`text-2xl font-bold tabular-nums ${net >= 0 ? 'text-status-success' : 'text-status-error'}`}>
            {net >= 0 ? '+' : '-'}{fmt(Math.abs(net))}
          </div>
        </div>
      </div>

      {/* ── Active teams ── */}
      {aliveTeams.length > 0 && (
        <div className="mb-6">
          <h2 className="section-label mb-3">Still Alive ({aliveTeams.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {aliveTeams.map((team) => (
              <TeamCard key={team.id} team={team} />
            ))}
          </div>
        </div>
      )}

      {/* ── Eliminated teams ── */}
      {eliminatedTeams.length > 0 && (
        <div>
          <h2 className="section-label mb-3">Eliminated ({eliminatedTeams.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
    <div className={`card p-4 transition-shadow hover:shadow-lg ${eliminated ? 'opacity-50' : ''}`}
      style={!eliminated ? { borderColor: color + '55' } : {}}>
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
            <div className="text-text-primary font-semibold text-sm">{team.name}</div>
            <div className="text-xs font-medium" style={{ color: eliminated ? '#64748b' : color }}>{team.region}</div>
          </div>
        </div>
        {eliminated && (
          <span className="badge badge-error text-xs">
            {team.eliminated_round ? `Lost – ${ROUND_NAMES[team.eliminated_round]}` : 'Eliminated'}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-sm">
        <div>
          <span className="text-text-secondary text-xs">Paid</span>
          <span className="text-text-primary font-medium ml-1 tabular-nums">{fmt(team.purchase_price)}</span>
        </div>
        <div>
          <span className="text-text-secondary text-xs">Earned</span>
          <span className="text-status-success font-medium ml-1 tabular-nums">{fmt(team.earnings)}</span>
        </div>
      </div>
    </div>
  );
}
