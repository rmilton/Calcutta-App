import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import useMediaQuery from '../useMediaQuery';

const BASE_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/events', label: 'Events' },
  { to: '/auction', label: 'Auction' },
];

export default function Nav() {
  const location = useLocation();
  const { participant, logout } = useAuth();
  const isMobileNav = useMediaQuery('(max-width: 760px)');
  const [menuOpen, setMenuOpen] = useState(false);
  const participantInitial = (participant?.name || '?').trim().charAt(0).toUpperCase() || '?';

  const links = participant?.isAdmin
    ? [...BASE_LINKS, { to: '/admin', label: 'Admin' }]
    : [
        BASE_LINKS[0],
        BASE_LINKS[1],
        { to: '/my-drivers', label: 'My Drivers' },
        BASE_LINKS[2],
      ];

  const isLinkActive = (to) => {
    if (to === '/admin') return location.pathname === '/admin' || location.pathname.startsWith('/admin/');
    return location.pathname === to;
  };

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileNav) setMenuOpen(false);
  }, [isMobileNav]);

  return (
    <>
      <header className="top-nav">
        <div className="top-nav-inner">
          <div className="brand">F1 Calcutta</div>

          <nav className="top-nav-links top-nav-links-desktop">
            {links.map((link) => (
              <Link
                key={link.to}
                className={`nav-link ${isLinkActive(link.to) ? 'active' : ''}`}
                to={link.to}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="top-nav-actions top-nav-actions-desktop">
            <div className="nav-user-chip">
              <span
                className="avatar nav-user-avatar"
                style={{
                  backgroundColor: `${participant?.color || '#e10600'}22`,
                  borderColor: `${participant?.color || '#e10600'}66`,
                  color: participant?.color || '#e10600',
                }}
              >
                {participantInitial}
              </span>
              <span className="nav-user-name">{participant?.name || 'Participant'}</span>
            </div>
            <button className="btn btn-outline" onClick={logout}>Logout</button>
          </div>

          <div className="top-nav-mobile-bar">
            <button
              type="button"
              className={`btn btn-outline mobile-menu-btn ${menuOpen ? 'active' : ''}`}
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav-panel"
            >
              {menuOpen ? 'Close' : 'Menu'}
            </button>
          </div>
        </div>

        {isMobileNav && menuOpen ? (
          <div id="mobile-nav-panel" className="top-nav-mobile-panel">
            <div className="nav-user-chip nav-user-chip-mobile">
              <span
                className="avatar nav-user-avatar"
                style={{
                  backgroundColor: `${participant?.color || '#e10600'}22`,
                  borderColor: `${participant?.color || '#e10600'}66`,
                  color: participant?.color || '#e10600',
                }}
              >
                {participantInitial}
              </span>
              <span className="nav-user-name">{participant?.name || 'Participant'}</span>
            </div>
            <div className="top-nav-mobile-links">
              {links.map((link) => (
                <Link
                  key={link.to}
                  className={`nav-link ${isLinkActive(link.to) ? 'active' : ''}`}
                  to={link.to}
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <button className="btn btn-outline mobile-logout-btn" onClick={logout}>Logout</button>
          </div>
        ) : null}
      </header>

      {isMobileNav && !participant?.isAdmin ? (
        <nav className="bottom-tab-nav" aria-label="Primary navigation">
          {links.map((link) => (
            <Link
              key={link.to}
              className={`bottom-tab-link ${isLinkActive(link.to) ? 'active' : ''}`}
              to={link.to}
            >
              <span>{link.label}</span>
            </Link>
          ))}
        </nav>
      ) : null}
    </>
  );
}
