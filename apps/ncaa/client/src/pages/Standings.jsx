import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocketEvent } from '../context/SocketContext';
import { useTournament } from '../context/TournamentContext';
import TeamLogo from '../components/TeamLogo';
import ParticipantAvatar from '../components/ParticipantAvatar';
import { fmt, api } from '../utils';

function Medal({ rank }) {
  if (rank === 1) return <span role="img" aria-label="Rank 1 — Gold medal" className="text-yellow-400">🥇</span>;
  if (rank === 2) return <span role="img" aria-label="Rank 2 — Silver medal" className="text-slate-300">🥈</span>;
  if (rank === 3) return <span role="img" aria-label="Rank 3 — Bronze medal" className="text-amber-600">🥉</span>;
  return <span aria-label={`Rank ${rank}`} className="text-text-secondary text-sm font-mono tabular-nums">#{rank}</span>;
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
      api(`/standings${apiTParam || ''}`).then((r) => r.json()),
      api(`/standings/ownership${apiTParam || ''}`).then((r) => r.json()),
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
    api(`/standings${apiTParam || ''}`).then((r) => r.json()).then((s) => {
      setStandings(s.standings || []);
      setTotalPot(s.totalPot || 0);
    });
  }, [apiTParam, isViewingHistory]);

  useSocketEvent('bracket:update', useCallback(() => { if (!isViewingHistory) refreshFull(); }, [refreshFull, isViewingHistory]));
  useSocketEvent('auction:sold', refreshStandings);
  useSocketEvent('standings:update', refreshStandings);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8" role="status" aria-label="Loading standings">
        <div className="space-y-3 animate-fade-in">
          <div className="skeleton h-20 w-full" />
          <div className="skeleton h-16 w-full" />
          <div className="skeleton h-16 w-full" />
          <div className="skeleton h-16 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">

      {/* ── Total pot banner ── */}
      <div className="card mb-6 p-5 flex items-center justify-between"
        style={{ background: 'linear-gradient(180deg, #1e293b 0%, #172033 100%)' }}>
        <div>
          <div className="section-label mb-1">Total Pot</div>
          <div className="text-3xl font-bold text-brand tabular-nums">{fmt(totalPot)}</div>
        </div>
        <span aria-hidden="true" className="text-4xl">🏆</span>
      </div>

      {standings.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3" aria-hidden="true">📊</div>
          <p className="text-text-secondary">Standings will appear once teams are sold.</p>
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
                className={`card overflow-hidden transition-all cursor-pointer hover:shadow-lg ${
                  isMe ? 'ring-1 ring-brand/50' : ''
                }`}
                onClick={() => setExpandedId(expanded ? null : p.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setExpandedId(expanded ? null : p.id);
                  }
                }}
              >
                <div className="px-4 py-4 flex items-center gap-4">
                  {/* Rank */}
                  <div className="w-8 text-center shrink-0">
                    <Medal rank={i + 1} />
                  </div>

                  {/* Avatar */}
                  <ParticipantAvatar name={p.name} color={p.color} size={36} />

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-semibold text-sm ${isMe ? 'text-brand' : 'text-text-primary'}`}>
                        {p.name}{isMe && <span className="text-xs text-text-secondary font-normal ml-1">(You)</span>}
                      </span>
                    </div>
                    <div className="text-xs text-text-secondary mt-0.5">
                      {p.teams_owned} teams · {aliveTeams.length} alive
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4 text-right text-sm shrink-0">
                    <div>
                      <div className="text-xs text-text-secondary">Spent</div>
                      <div className="text-text-primary font-medium tabular-nums">{fmt(p.total_spent)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-text-secondary">Earned</div>
                      <div className="text-status-success font-medium tabular-nums">{fmt(p.total_earned)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-text-secondary">Net</div>
                      <div className={`font-bold tabular-nums ${net >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                        {net >= 0 ? '+' : '-'}{fmt(Math.abs(net))}
                      </div>
                    </div>
                  </div>

                  {/* Animated chevron */}
                  <svg
                    aria-hidden="true"
                    className={`w-4 h-4 text-text-secondary shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Expanded team list */}
                {expanded && myTeams.length > 0 && (
                  <div className="border-t border-surface-border px-4 py-3 bg-surface-base/40 animate-fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {myTeams.map((t) => (
                        <div
                          key={t.id}
                          className={`flex items-center justify-between bg-surface-input/50 rounded-xl px-3 py-2 ${
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
                            <span className="text-text-primary text-sm truncate">{t.team_name}</span>
                            {t.eliminated && (
                              <span aria-hidden="true" className="text-xs text-status-error">❌</span>
                            )}
                          </div>
                          <div className="text-xs text-text-secondary shrink-0 ml-2 tabular-nums">
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
