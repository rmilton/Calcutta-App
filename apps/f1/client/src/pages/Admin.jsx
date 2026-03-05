import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import useAdminData from './admin/useAdminData';

const ADMIN_SECTIONS = [
  { path: 'overview', label: 'Overview', description: 'Season status and pool summary' },
  { path: 'auction', label: 'Auction', description: 'Controls and timing settings' },
  { path: 'results', label: 'Results Sync', description: 'Sync event outcomes and payouts' },
  { path: 'test-data', label: 'Test Data', description: 'Manual edits and payout testing' },
  { path: 'payouts', label: 'Payout Rules', description: 'Adjust basis-point distribution' },
];

export default function Admin() {
  const contextValue = useAdminData();
  const { message } = contextValue;

  return (
    <div className="stack-lg">
      <section className="panel panel-hero admin-header">
        <div className="hero-kicker">Race Control</div>
        <h1>Admin Console</h1>
        <p>Use sectioned controls to run the auction, sync races, and tune payout models.</p>
      </section>

      {message ? <section className="panel note-panel">{message}</section> : null}

      <div className="admin-layout">
        <aside className="panel admin-sidebar">
          <nav className="admin-secondary-nav" aria-label="Admin sections">
            {ADMIN_SECTIONS.map((section) => (
              <NavLink
                key={section.path}
                to={`/admin/${section.path}`}
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
                to={`/admin/${section.path}`}
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
