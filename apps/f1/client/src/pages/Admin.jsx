import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import useAdminData from './admin/useAdminData';

const ADMIN_SECTIONS = [
  { path: 'setup', label: 'Setup', description: 'Participants & auction controls' },
  { path: 'race-weekend', label: 'Race Weekend', description: 'Sync results & manage events' },
  { path: 'payouts', label: 'Payouts', description: 'Audit results & payout rules' },
  { path: 'tools', label: 'Tools', description: 'Test data & advanced options' },
];

export default function Admin() {
  const contextValue = useAdminData();
  const { message, settings, participants } = contextValue;
  const nonAdminCount = (participants || []).filter((p) => !p.is_admin).length;
  const auctionStatus = settings?.auction_status || '—';

  return (
    <div className="stack-lg">
      <div className="admin-status-bar">
        <span className="admin-status-kicker">Race Control</span>
        <div className="admin-status-items">
          <div className="admin-status-item">
            <span className="label">Invite Code</span>
            <strong>{settings?.invite_code || '—'}</strong>
          </div>
          <div className="admin-status-item">
            <span className="label">Auction</span>
            <strong className={`status-text status-${auctionStatus}`}>{auctionStatus}</strong>
          </div>
          <div className="admin-status-item">
            <span className="label">Participants</span>
            <strong>{nonAdminCount}</strong>
          </div>
        </div>
      </div>

      {message ? <section className="panel note-panel">{message}</section> : null}

      <div className="admin-layout">
        <aside className="panel admin-sidebar">
          <nav className="admin-secondary-nav" aria-label="Admin sections">
            {ADMIN_SECTIONS.map((section) => (
              <NavLink
                key={section.path}
                to={section.path}
                className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
              >
                <span className="admin-nav-label">{section.label}</span>
                <span className="admin-nav-desc">{section.description}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <section className="admin-main stack-lg">
          <nav className="admin-secondary-nav-mobile" aria-label="Admin sections">
            {ADMIN_SECTIONS.map((section) => (
              <NavLink
                key={section.path}
                to={section.path}
                className={({ isActive }) => `admin-nav-pill ${isActive ? 'active' : ''}`}
              >
                {section.label}
              </NavLink>
            ))}
          </nav>
          <Outlet context={contextValue} />
        </section>
      </div>
    </div>
  );
}
