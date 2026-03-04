import React from 'react';
import useAdminOutletContext from './useAdminOutletContext';

export default function AuctionPage() {
  const { settings, setField, saveSettings, runAuctionAction, loading, hasLoaded } = useAdminOutletContext();

  if (loading && !hasLoaded) {
    return <section className="loading-panel">Loading admin data...</section>;
  }

  return (
    <div className="stack-lg">
      <section className="panel stack">
        <h2>Auction Controls</h2>
        <div className="row wrap gap-sm">
          <button className="btn" onClick={() => runAuctionAction('/admin/auction/start')}>Open</button>
          <button className="btn btn-outline" onClick={() => runAuctionAction('/admin/auction/pause')}>Pause</button>
          <button className="btn btn-outline" onClick={() => runAuctionAction('/admin/auction/next')}>Start Next Driver</button>
          <button className="btn btn-outline" onClick={() => runAuctionAction('/admin/auction/close')}>Close Active</button>
        </div>
      </section>

      <section className="panel stack">
        <h2>Auction Settings</h2>
        <div className="grid-3">
          <label>
            Timer (sec)
            <input
              value={settings?.auction_timer_seconds ?? ''}
              onChange={(e) => setField('auction_timer_seconds', e.target.value)}
            />
          </label>
          <label>
            Grace (sec)
            <input
              value={settings?.auction_grace_seconds ?? ''}
              onChange={(e) => setField('auction_grace_seconds', e.target.value)}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={String(settings?.auction_auto_advance) === '1' || settings?.auction_auto_advance === 1 || settings?.auction_auto_advance === true}
              onChange={(e) => setField('auction_auto_advance', e.target.checked ? 1 : 0)}
            />
            Auto Advance
          </label>
        </div>
        <button className="btn" onClick={saveSettings}>Save Settings</button>
      </section>
    </div>
  );
}
