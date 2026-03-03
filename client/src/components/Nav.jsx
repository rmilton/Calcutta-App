import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTournament } from '../context/TournamentContext';
import ParticipantAvatar from './ParticipantAvatar';

export default function Nav() {
  const { participant, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const tournament = useTournament();

  const links = [
    { to: '/standings', label: 'Standings' },
    { to: '/bracket', label: 'Bracket' },
    { to: '/my-teams', label: 'My Teams' },
    { to: '/auction', label: 'Auction' },
    ...(participant?.isAdmin ? [{ to: '/admin', label: 'Admin' }] : []),
  ];

  const pastTournaments = tournament?.allTournaments?.filter(
    (t) => t.id !== tournament.activeTournamentId
  ) ?? [];

  return (
    <>
      <nav className="bg-surface-raised border-b border-surface-border sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">

          {/* ── Logo wordmark ── */}
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2.5 group" aria-label="Calcutta home">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shadow-glow-sm group-hover:shadow-glow-brand transition-shadow"
                style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}
              >
                <span aria-hidden="true" className="text-base leading-none">🏀</span>
              </div>
              <span className="font-bold text-lg tracking-tight text-text-primary">
                Calcutta<span className="text-brand font-extrabold">.</span>
              </span>
            </Link>

            {/* Tournament name badge */}
            {tournament?.activeTournament && (
              <span className="hidden md:inline text-text-secondary text-xs border border-surface-border rounded-lg px-2 py-0.5 truncate max-w-[180px]">
                {tournament.activeTournament.name}
              </span>
            )}
          </div>

          {/* ── Desktop nav links ── */}
          <div className="hidden md:flex items-center gap-0.5">
            {links.map((l) => {
              const active = location.pathname === l.to;
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  aria-current={active ? 'page' : undefined}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'text-text-primary bg-surface-input'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-input'
                  }`}
                >
                  {l.label}
                  {active && (
                    <span className="block h-0.5 bg-brand rounded-full mt-0.5" aria-hidden="true" />
                  )}
                </Link>
              );
            })}

            {/* History picker */}
            {pastTournaments.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setHistoryOpen((o) => !o)}
                  aria-expanded={historyOpen}
                  aria-haspopup="listbox"
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-input transition-colors flex items-center gap-1.5"
                >
                  Archive
                  <svg aria-hidden="true" className="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {historyOpen && (
                  <div
                    role="listbox"
                    aria-label="Past tournaments"
                    className="absolute right-0 top-full mt-1.5 bg-surface-raised border border-surface-border rounded-xl shadow-lg min-w-[200px] z-50 py-1.5 animate-fade-in"
                  >
                    {tournament.activeTournamentId && (
                      <button
                        role="option"
                        aria-selected="false"
                        onClick={() => { tournament.returnToActive(); setHistoryOpen(false); }}
                        className="w-full text-left px-4 py-2 text-sm text-brand hover:bg-surface-input transition-colors"
                      >
                        ← Current Tournament
                      </button>
                    )}
                    {pastTournaments.map((t) => (
                      <button
                        key={t.id}
                        role="option"
                        aria-selected={tournament.viewingTournamentId === t.id}
                        onClick={() => { tournament.viewTournament(t.id); setHistoryOpen(false); }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-surface-input transition-colors ${
                          tournament.viewingTournamentId === t.id ? 'text-brand' : 'text-text-secondary'
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

          {/* ── User area ── */}
          <div className="flex items-center gap-2">
            {/* Avatar + name (desktop) */}
            <div className="hidden md:flex items-center gap-2.5">
              <ParticipantAvatar name={participant?.name} color={participant?.color} size={32} />
              <span className="text-sm font-medium text-text-primary hidden lg:block">{participant?.name}</span>
            </div>

            <button
              onClick={logout}
              className="hidden md:block btn btn-ghost btn-sm"
            >
              Leave
            </button>

            {/* Mobile hamburger */}
            <button
              className="md:hidden touch-target text-text-secondary hover:text-text-primary rounded-lg hover:bg-surface-input"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav-drawer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d={menuOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Mobile drawer ── */}
        {menuOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 md:hidden"
              onClick={() => setMenuOpen(false)}
              aria-hidden="true"
            />
            <div
              id="mobile-nav-drawer"
              className="relative z-40 md:hidden bg-surface-raised border-t border-surface-border px-4 py-4 flex flex-col gap-1 motion-safe:animate-slide-up"
            >
              {/* User row */}
              <div className="flex items-center gap-2.5 px-3 pb-3 mb-1 border-b border-surface-border">
                <ParticipantAvatar name={participant?.name} color={participant?.color} size={32} />
                <span className="text-sm font-semibold text-text-primary">{participant?.name}</span>
              </div>

              {links.map((l) => {
                const active = location.pathname === l.to;
                return (
                  <Link
                    key={l.to}
                    to={l.to}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      active
                        ? 'bg-brand text-white'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-input'
                    }`}
                  >
                    {l.label}
                  </Link>
                );
              })}

              {pastTournaments.length > 0 && (
                <>
                  <div className="section-label px-3 pt-3">Archive</div>
                  {pastTournaments.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { tournament.viewTournament(t.id); setMenuOpen(false); }}
                      className="text-left px-3 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-input rounded-xl transition-colors"
                    >
                      {t.name}
                    </button>
                  ))}
                </>
              )}

              <div className="border-t border-surface-border mt-2 pt-2">
                <button
                  onClick={() => { setMenuOpen(false); logout(); }}
                  className="text-left w-full px-3 py-2.5 text-sm text-text-secondary hover:text-text-primary rounded-xl transition-colors"
                >
                  Leave
                </button>
              </div>
            </div>
          </>
        )}
      </nav>

      {/* ── History banner ── */}
      {tournament?.isViewingHistory && (
        <div
          className="sticky top-14 z-40 border-b"
          style={{ backgroundColor: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.2)' }}
        >
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-status-warning">
              <span aria-hidden="true">📁</span>
              <span>
                Viewing archive:{' '}
                <strong>
                  {tournament.allTournaments?.find((t) => t.id === tournament.viewingTournamentId)?.name ?? `#${tournament.viewingTournamentId}`}
                </strong>
                {' '}— read only
              </span>
            </div>
            <button
              onClick={tournament.returnToActive}
              className="text-status-warning hover:text-white text-xs font-semibold border border-status-warning/40 hover:border-status-warning rounded-lg px-3 py-1.5 transition-colors shrink-0"
            >
              Return to live →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
