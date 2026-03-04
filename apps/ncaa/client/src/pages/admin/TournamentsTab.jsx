import React, { useState } from 'react';
import { useTournament } from '../../context/TournamentContext';
import { api } from '../../utils';

export default function TournamentsTab() {
  const { allTournaments, activeTournamentId, refreshTournaments } = useTournament() ?? {};
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [activating, setActivating] = useState(null);
  const [msg, setMsg] = useState('');

  const flashMsg = (text) => { setMsg(text); setTimeout(() => setMsg(''), 4000); };

  const createTournament = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const r = await api('/tournaments', { method: 'POST', body: JSON.stringify({ name: newName.trim() }) });
    const data = await r.json();
    setCreating(false);
    if (!r.ok) { flashMsg(data.error || 'Failed to create tournament'); return; }
    setNewName('');
    refreshTournaments?.();
    flashMsg(`Tournament "${data.tournament.name}" created! Invite code: ${data.tournament.invite_code}`);
  };

  const activate = async (id, name) => {
    if (!confirm(`Switch active tournament to "${name}"? All participants will immediately see this tournament.`)) return;
    setActivating(id);
    await api(`/tournaments/${id}/activate`, { method: 'POST' });
    setActivating(null);
    refreshTournaments?.();
    flashMsg(`Switched to "${name}"`);
  };

  const formatDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString() : '—';

  return (
    <div className="space-y-6 max-w-2xl">
      <p className="text-slate-400 text-sm">
        Create and manage tournaments. Only one tournament is active at a time — all participants see the active tournament.
        Past tournaments remain viewable as read-only archives.
      </p>

      {/* Create new tournament */}
      <div className="bg-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-orange-400">Create New Tournament</h3>
        <div className="flex gap-3">
          <input
            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="e.g. March Madness 2026"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createTournament()}
          />
          <button
            onClick={createTournament}
            disabled={creating || !newName.trim()}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold px-5 py-2 rounded-lg shrink-0"
          >
            {creating ? 'Creating…' : '+ Create'}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          A new tournament is pre-loaded with the 2025 teams. Use Teams / Import to load the actual 2026 bracket after Selection Sunday.
          The tournament is <strong className="text-slate-300">not</strong> automatically activated — set it as Active when ready.
        </p>
      </div>

      {msg && <div className="bg-blue-900/50 border border-blue-700 rounded-lg px-4 py-3 text-blue-300 text-sm">{msg}</div>}

      {/* Tournament list */}
      <div className="space-y-2">
        {(allTournaments || []).map((t) => {
          const isActive = t.id === activeTournamentId;
          return (
            <div
              key={t.id}
              className={`rounded-xl p-4 flex items-center justify-between gap-4 ${
                isActive ? 'bg-orange-900/30 border border-orange-600' : 'bg-slate-800 border border-slate-700'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-semibold">{t.name}</span>
                  {isActive && (
                    <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded font-medium">ACTIVE</span>
                  )}
                </div>
                <div className="flex gap-4 mt-1 text-xs text-slate-500 flex-wrap">
                  <span>Created {formatDate(t.created_at)}</span>
                  <span>{t.participant_count} participant{t.participant_count !== 1 ? 's' : ''}</span>
                  <span className="font-mono">Invite: <span className="text-slate-300">{t.invite_code}</span></span>
                  <span className={`capitalize ${
                    t.auction_status === 'complete' ? 'text-blue-400' :
                    t.auction_status === 'open' ? 'text-green-400' :
                    'text-slate-400'
                  }`}>{t.auction_status}</span>
                </div>
              </div>
              {!isActive && (
                <button
                  onClick={() => activate(t.id, t.name)}
                  disabled={activating === t.id}
                  className="bg-slate-600 hover:bg-slate-500 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg shrink-0"
                >
                  {activating === t.id ? 'Switching…' : 'Set as Active'}
                </button>
              )}
            </div>
          );
        })}
        {(!allTournaments || allTournaments.length === 0) && (
          <p className="text-slate-400 text-sm">No tournaments yet.</p>
        )}
      </div>
    </div>
  );
}
