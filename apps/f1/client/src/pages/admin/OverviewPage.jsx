import React from 'react';
import useAdminOutletContext from './useAdminOutletContext';

export default function OverviewPage() {
  const { settings, participants, events, rules, loading, hasLoaded } = useAdminOutletContext();

  if (loading && !hasLoaded) {
    return <section className="loading-panel">Loading admin data...</section>;
  }

  return (
    <div className="stack-lg">
      <section className="panel telemetry-strip">
        <div className="strip-item">
          <span className="label">Invite Code</span>
          <strong>{settings?.invite_code || '—'}</strong>
        </div>
        <div className="strip-item">
          <span className="label">Auction Status</span>
          <strong className={`status-text status-${settings?.auction_status}`}>{settings?.auction_status || 'unknown'}</strong>
        </div>
        <div className="strip-item">
          <span className="label">Participants</span>
          <strong>{participants?.length || 0}</strong>
        </div>
      </section>

      <section className="panel stack">
        <h2>Season Summary</h2>
        <div className="grid-3">
          <div className="strip-item">
            <span className="label">Race Events</span>
            <strong>{events?.length || 0}</strong>
          </div>
          <div className="strip-item">
            <span className="label">GP Rule Rows</span>
            <strong>{rules?.grand_prix?.length || 0}</strong>
          </div>
          <div className="strip-item">
            <span className="label">Sprint Rule Rows</span>
            <strong>{rules?.sprint?.length || 0}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
