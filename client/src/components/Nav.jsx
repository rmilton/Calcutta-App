import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTournament } from '../context/TournamentContext';

export default function Nav() {
  const { participant, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const tournament = useTournament();

  const links = [
    { to: '/auction', label: 'Auction' },
    { to: '/bracket', label: 'Bracket' },
    { to: '/standings', label: 'Standings' },
    { to: '/my-teams', label: 'My Teams' },
    ...(participant?.isAdmin ? [{ to: '/admin', label: 'Admin' }] : []),
  ];

  const pastTournaments = tournament?.allTournaments?.filter(
    (t) => t.id !== tournament.activeTournamentId
  ) ?? [];

  return (
    <>
      <nav className="bg-slate-800 border-b border-slate-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-orange-400 font-bold text-lg tracking-tight">
              🏀 Calcutta
            </Link>
            {/* Tournament name badge */}
            {tournament?.activeTournament && (
              <span className="hidden md:inline text-text-secondary text-xs border border-slate-700 rounded px-2 py-0.5 truncate max-w-[180px]">
                {tournament.activeTournament.name}
              </span>
            )}
          </div>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  location.pathname === l.to
                    ? 'bg-orange-500 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                {l.label}
              </Link>
            ))}

            {/* History picker (only shown when there are past tournaments) */}
            {pastTournaments.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setHistoryOpen((o) => !o)}
                  className="px-3 py-1.5 rounded text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-700 transition-colors flex items-center gap-1"
                >
                  Archive ▾
                </button>
                {historyOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl min-w-[180px] z-50 py-1">
                    {tournament.activeTournamentId && (
                      <button
                        onClick={() => { tournament.returnToActive(); setHistoryOpen(false); }}
                        className="w-full text-left px-4 py-2 text-sm text-orange-400 hover:bg-slate-700"
                      >
                        ← Current Tournament
                      </button>
                    )}
                    {pastTournaments.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => { tournament.viewTournament(t.id); setHistoryOpen(false); }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-700 ${
                          tournament.viewingTournamentId === t.id ? 'text-orange-400' : 'text-slate-300'
                        }`}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden md:flex items-center gap-2 text-sm">
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ backgroundColor: participant?.color }}
              >
                {participant?.name?.[0]?.toUpperCase()}
              </span>
              <span className="text-slate-300">{participant?.name}</span>
            </span>

            <button
              onClick={logout}
              className="hidden md:block text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Leave
            </button>

            {/* Mobile hamburger */}
            <button
              className="md:hidden text-slate-300 hover:text-white"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav-drawer"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d={menuOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div id="mobile-nav-drawer" className="md:hidden bg-slate-800 border-t border-slate-700 px-4 py-3 flex flex-col gap-2">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setMenuOpen(false)}
                className={`px-3 py-2 rounded text-sm font-medium ${
                  location.pathname === l.to
                    ? 'bg-orange-500 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                {l.label}
              </Link>
            ))}
            {pastTournaments.length > 0 && (
              <>
                <div className="text-xs text-text-secondary px-3 pt-1 uppercase tracking-wider">Archive</div>
                {pastTournaments.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { tournament.viewTournament(t.id); setMenuOpen(false); }}
                    className="text-left px-3 py-2 text-sm text-slate-400 hover:text-white"
                  >
                    {t.name}
                  </button>
                ))}
              </>
            )}
            <button onClick={() => { setMenuOpen(false); logout(); }} className="text-left px-3 py-2 text-sm text-slate-400">
              Leave
            </button>
          </div>
        )}
      </nav>

      {/* History banner — shown below nav when viewing an archived tournament */}
      {tournament?.isViewingHistory && (
        <div className="sticky top-14 z-40 bg-amber-900/80 border-b border-amber-700 backdrop-blur">
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-4">
            <span className="text-amber-300 text-sm font-medium">
              📁 Viewing archived tournament:{' '}
              <span className="font-bold">
                {tournament.allTournaments?.find((t) => t.id === tournament.viewingTournamentId)?.name ?? `#${tournament.viewingTournamentId}`}
              </span>
              {' '}— read only
            </span>
            <button
              onClick={tournament.returnToActive}
              className="text-amber-300 hover:text-white text-xs font-semibold border border-amber-600 hover:border-amber-400 rounded px-3 py-1 transition-colors shrink-0"
            >
              Return to Current
            </button>
          </div>
        </div>
      )}
    </>
  );
}
