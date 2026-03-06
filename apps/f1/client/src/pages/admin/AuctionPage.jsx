import React from 'react';
import AdminLoadingState from './AdminLoadingState';
import useAdminOutletContext from './useAdminOutletContext';

export default function AuctionPage() {
  const { settings, setField, saveSettings, runAuctionAction, loading, hasLoaded } = useAdminOutletContext();
  const budgetCapValue = typeof settings?.auction_budget_cap_cents === 'string'
    ? settings.auction_budget_cap_cents
    : String(settings?.auction_budget_cap_cents == null ? 200 : (Number(settings.auction_budget_cap_cents) / 100));

  if (loading && !hasLoaded) {
    return <AdminLoadingState />;
  }

  return (
    <div className="stack-lg">
      <section className="panel stack">
        <h2>Auction Controls</h2>
        <div className="row wrap gap-sm">
          <button className="btn" onClick={() => runAuctionAction('/admin/auction/start')}>Open</button>
          <button className="btn btn-outline" onClick={() => runAuctionAction('/admin/auction/pause')}>Pause</button>
          <button className="btn btn-outline" onClick={() => runAuctionAction('/admin/auction/next')}>Start Next Driver</button>
          <button className="btn btn-outline" onClick={() => runAuctionAction('/admin/auction/shuffle')}>Shuffle Pending Order</button>
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
          <label>
            Budget Cap ($)
            <input
              type="number"
              min="0"
              step="1"
              value={budgetCapValue}
              onChange={(e) => setField('auction_budget_cap_cents', e.target.value)}
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
