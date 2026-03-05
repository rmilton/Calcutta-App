import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const BASE_LINKS = [
  { to: '/standings', label: 'Standings' },
  { to: '/events', label: 'Events' },
  { to: '/auction', label: 'Auction' },
];

export default function Nav() {
  const location = useLocation();
  const { participant, logout } = useAuth();
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

  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <div className="brand">F1 Calcutta</div>
        <nav className="top-nav-links">
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
        <div className="top-nav-actions">
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
      </div>
    </header>
  );
}
