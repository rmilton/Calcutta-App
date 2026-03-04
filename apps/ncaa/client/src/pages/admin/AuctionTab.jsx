import React, { useState, useEffect, useCallback } from 'react';
import { useSocketEvent } from '../../context/SocketContext';
import CountdownTimer from '../../components/CountdownTimer';
import { fmt, api, REGIONS } from '../../utils';

export default function AuctionTab() {
  const [items, setItems] = useState([]);
  const [auctionStatus, setAuctionStatus] = useState('waiting');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [filterRegion, setFilterRegion] = useState('All');

  const load = useCallback(() => {
    Promise.all([
      api('/auction').then((r) => r.json()),
    ]).then(([auctionData]) => {
      setItems(auctionData.items || []);
      setAuctionStatus(auctionData.auctionStatus);
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh whenever auction state changes
  useSocketEvent('auction:started', load);
  useSocketEvent('auction:sold', load);
  useSocketEvent('auction:nobids', load);
  useSocketEvent('auction:complete', load);
  useSocketEvent('auction:update', load);

  const flashMsg = (text) => { setMsg(text); setTimeout(() => setMsg(''), 3000); };

  const startAuction = async () => {
    await api('/admin/auction/start', { method: 'POST' });
    setAuctionStatus('open');
    flashMsg('Auction opened!');
  };

  const pauseAuction = async () => {
    await api('/admin/auction/pause', { method: 'POST' });
    setAuctionStatus('paused');
    flashMsg('Auction paused');
  };

  const startNext = async (teamId) => {
    const r = await api('/admin/auction/next', { method: 'POST', body: JSON.stringify({ teamId }) });
    const data = await r.json();
    if (!r.ok) { flashMsg(data.error); return; }
    flashMsg('Auction started for next team!');
    load();
  };

  const closeActive = async () => {
    await api('/admin/auction/close', { method: 'POST' });
    flashMsg('Auction closed manually');
    load();
  };

  const pending = items.filter((i) => i.status === 'pending');
  const active = items.find((i) => i.status === 'active');
  const sold = items.filter((i) => i.status === 'sold');

  const filtered = pending.filter((i) => filterRegion === 'All' || i.region === filterRegion);

  if (loading) return <div className="text-slate-400 py-8 text-center">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {auctionStatus !== 'open' && auctionStatus !== 'complete' && (
          <button onClick={startAuction} className="bg-green-600 hover:bg-green-700 text-white font-bold px-5 py-2 rounded-lg">
            Open Auction
          </button>
        )}
        {auctionStatus === 'open' && !active && (
          <button onClick={pauseAuction} className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold px-5 py-2 rounded-lg">
            Pause Auction
          </button>
        )}
        {active && (
          <button onClick={closeActive} className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2 rounded-lg">
            Force Close Current Bid
          </button>
        )}
        {!active && auctionStatus === 'open' && pending.length > 0 && (
          <button onClick={() => startNext()} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-2 rounded-lg">
            Start Next Team ▶
          </button>
        )}
        {msg && <span className="text-green-400 text-sm">{msg}</span>}
      </div>

      {/* Active team */}
      {active && (
        <div className="card-elevated ring-1 ring-brand/30 shadow-glow-sm p-4">
          <p className="section-label text-brand mb-2">Currently Up for Bid</p>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-brand font-bold shrink-0">#{active.seed}</span>
              <span className="text-text-primary font-bold truncate">{active.team_name}</span>
              <span className="badge badge-neutral text-xs shrink-0">{active.region}</span>
            </div>
            <div className="flex items-center gap-5 shrink-0">
              <div className="text-right">
                <div className="section-label mb-0.5">Current Bid</div>
                <div className="text-text-primary font-bold tabular-nums">{fmt(active.current_price || 0)}</div>
                {active.leader_name && <div className="text-text-secondary text-xs">{active.leader_name}</div>}
              </div>
              <CountdownTimer endTime={active.bid_end_time} compact />
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="card p-3">
          <div className="text-2xl font-bold text-brand tabular-nums">{pending.length}</div>
          <div className="section-label mt-1">Pending</div>
        </div>
        <div className="card p-3">
          <div className="text-2xl font-bold text-status-success tabular-nums">{sold.length}</div>
          <div className="section-label mt-1">Sold</div>
        </div>
        <div className="card p-3">
          <div className="text-2xl font-bold text-text-primary tabular-nums">
            {fmt(sold.reduce((s, i) => s + (i.final_price || 0), 0))}
          </div>
          <div className="section-label mt-1">Total Pot</div>
        </div>
      </div>

      {/* Region filter + pending queue */}
      {pending.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-sm text-slate-400">Filter:</span>
            {['All', ...REGIONS].map((r) => (
              <button
                key={r}
                onClick={() => setFilterRegion(r)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  filterRegion === r ? 'bg-brand text-white' : 'bg-surface-input text-text-secondary hover:text-text-primary'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filtered.map((item) => (
              <div key={item.id} className="card p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-brand font-bold text-sm shrink-0">#{item.seed}</span>
                  <span className="text-text-primary text-sm truncate">{item.team_name}</span>
                  <span className="badge badge-neutral text-xs shrink-0">{item.region}</span>
                </div>
                <button
                  onClick={() => startNext(item.team_id)}
                  disabled={!!active || auctionStatus !== 'open'}
                  className="btn-primary btn-sm shrink-0"
                >
                  Start
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
