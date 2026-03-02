import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocketEvent } from '../context/SocketContext';
import { useTournament } from '../context/TournamentContext';
import TeamLogo from '../components/TeamLogo';
import { fmt } from '../utils';

function Medal({ rank }) {
  if (rank === 1) return <span role="img" aria-label="Rank 1 — Gold medal" className="text-yellow-400">🥇</span>;
  if (rank === 2) return <span role="img" aria-label="Rank 2 — Silver medal" className="text-slate-300">🥈</span>;
  if (rank === 3) return <span role="img" aria-label="Rank 3 — Bronze medal" className="text-amber-600">🥉</span>;
  return <span aria-label={`Rank ${rank}`} className="text-text-secondary text-sm font-mono">#{rank}</span>;
}

export default function Standings() {
  const { participant } = useAuth();
  const { isViewingHistory, apiTParam, refreshKey } = useTournament() ?? {};
  const [standings, setStandings] = useState([]);
  const [ownership, setOwnership] = useState([]);
  const [totalPot, setTotalPot] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const refreshFull = useCallback(() => {
    Promise.all([
      fetch(`/api/standings${apiTParam || ''}`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`/api/standings/ownership${apiTParam || ''}`, { credentials: 'include' }).then((r) => r.json()),
    ]).then(([standingsData, ownershipData]) => {
      setStandings(standingsData.standings || []);
      setTotalPot(standingsData.totalPot || 0);
      setOwnership(ownershipData || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [apiTParam]);

  useEffect(() => { refreshFull(); }, [refreshFull, refreshKey]);

  const refreshStandings = useCallback(() => {
    if (isViewingHistory) return;
    fetch(`/api/standings${apiTParam || ''}`, { credentials: 'include' }).then((r) => r.json()).then((s) => {
      setStandings(s.standings || []);
      setTotalPot(s.totalPot || 0);
    });
  }, [apiTParam, isViewingHistory]);

  useSocketEvent('bracket:update', useCallback(() => { if (!isViewingHistory) refreshFull(); }, [refreshFull, isViewingHistory]));
  useSocketEvent('auction:sold', refreshStandings);
  useSocketEvent('standings:update', refreshStandings);

  if (loading) return <div className="flex items-center justify-center min-h-[60vh] text-slate-400">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Standings</h1>
        <div className="text-right">
          <div className="text-xs text-slate-400 uppercase tracking-wider">Total Pot</div>
          <div className="text-2xl font-bold text-green-400">{fmt(totalPot)}</div>
        </div>
      </div>

      {standings.length === 0 ? (
        <div className="bg-slate-800 rounded-xl p-10 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-slate-400">Standings will appear once teams are sold.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {standings.map((p, i) => {
            const net = p.total_earned - p.total_spent;
            const isMe = p.id === participant?.id;
            const myTeams = ownership.filter((o) => o.participant_id === p.id);
            const aliveTeams = myTeams.filter((o) => !o.eliminated);
            const expanded = expandedId === p.id;

            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                aria-label={`${p.name} — ${expanded ? 'collapse' : 'expand'} team details`}
                className={`rounded-xl overflow-hidden border transition-all cursor-pointer ${
                  isMe ? 'border-orange-500' : 'border-slate-700'
                } ${expanded ? 'bg-slate-800' : 'bg-slate-800 hover:bg-slate-750'}`}
                onClick={() => setExpandedId(expanded ? null : p.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(expanded ? null : p.id); } }}
              >
                <div className="px-4 py-4 flex items-center gap-4">
                  <div className="w-8 text-center">
                    <Medal rank={i + 1} />
                  </div>

                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.name[0].toUpperCase()}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold text-sm ${isMe ? 'text-orange-400' : 'text-white'}`}>
                        {p.name} {isMe && '(You)'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {p.teams_owned} teams · {aliveTeams.length} alive
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-right text-sm shrink-0">
                    <div>
                      <div className="text-xs text-text-secondary">Spent</div>
                      <div className="text-slate-200 font-medium">{fmt(p.total_spent)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-text-secondary">Earned</div>
                      <div className="text-green-400 font-medium">{fmt(p.total_earned)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-text-secondary">Net</div>
                      <div className={`font-bold ${net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {net >= 0 ? '+' : '-'}{fmt(Math.abs(net))}
                      </div>
                    </div>
                  </div>

                  <span aria-hidden="true" className="text-text-secondary text-xs">{expanded ? '▲' : '▼'}</span>
                </div>

                {/* Expanded team list */}
                {expanded && myTeams.length > 0 && (
                  <div className="border-t border-slate-700 px-4 py-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {myTeams.map((t) => (
                        <div
                          key={t.id}
                          className={`flex items-center justify-between bg-slate-700/50 rounded-lg px-3 py-2 ${
                            t.eliminated ? 'opacity-40' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <TeamLogo
                              espnId={t.team_espn_id}
                              teamColor={t.team_color}
                              name={t.team_name}
                              seed={t.seed}
                              size={18}
                              eliminated={!!t.eliminated}
                            />
                            <span className="text-white text-sm truncate">{t.team_name}</span>
                            {t.eliminated && <span className="text-xs text-red-500">❌</span>}
                          </div>
                          <div className="text-xs text-slate-400 shrink-0 ml-2">
                            {fmt(t.purchase_price)}
                          </div>
                        </div>
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
