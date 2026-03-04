import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const BASE_LINKS = [
  { to: '/auction', label: 'Auction' },
  { to: '/events', label: 'Events' },
  { to: '/standings', label: 'Standings' },
  { to: '/my-drivers', label: 'My Drivers' },
];

export default function Nav() {
  const location = useLocation();
  const { participant, logout } = useAuth();

  const links = participant?.isAdmin
    ? [...BASE_LINKS, { to: '/admin', label: 'Admin' }]
    : BASE_LINKS;

  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <div className="brand">F1 Calcutta</div>
        <nav className="top-nav-links">
          {links.map((link) => (
            <Link
              key={link.to}
              className={`nav-link ${location.pathname === link.to ? 'active' : ''}`}
              to={link.to}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <button className="btn btn-outline" onClick={logout}>Logout</button>
      </div>
    </header>
  );
}
