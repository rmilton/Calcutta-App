import React, { useState, useEffect, useCallback } from 'react';
import { useSocketEvent } from '../context/SocketContext';
import { useTournament } from '../context/TournamentContext';
import { fmt } from '../utils';

const ROUND_NAMES = ['Round of 64', 'Round of 32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship'];
const REGIONS = ['East', 'West', 'South', 'Midwest'];

const api = (path, opts = {}) =>
  fetch(`/api${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });

// Compact live countdown for the admin active-team banner
function TimeLeft({ endTime }) {
  const [timeLeft, setTimeLeft] = useState(() => Math.max(0, (endTime || 0) - Date.now()));

  useEffect(() => {
    if (!endTime) { setTimeLeft(0); return; }
    const tick = () => setTimeLeft(Math.max(0, endTime - Date.now()));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endTime]);

  const seconds = Math.ceil(timeLeft / 1000);
  const isUrgent = seconds <= 10 && seconds > 0;
  const isDone = timeLeft === 0;

  return (
    <div className="text-right shrink-0">
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Time Left</div>
      <div className={`font-mono font-bold tabular-nums text-xl ${
        isDone ? 'text-slate-500' : isUrgent ? 'text-red-400 animate-pulse' : 'text-green-400'
      }`}>
        {String(Math.floor(seconds / 60)).padStart(1, '0')}:{String(seconds % 60).padStart(2, '0')}
      </div>
    </div>
  );
}

// ──────────────────────── Sub-tabs ────────────────────────

function SettingsTab() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api('/admin/settings').then((r) => r.json()).then(setSettings);
  }, []);

  const save = async () => {
    setSaving(true);
    await api('/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        auction_timer_seconds: settings.auction_timer_seconds,
        auction_grace_seconds: settings.auction_grace_seconds,
        auction_order: settings.auction_order || 'random',
        auction_auto_advance: settings.auction_auto_advance || '0',
        ai_commentary_after_sale: settings.ai_commentary_after_sale || '1',
        ai_commentary_end_of_round: settings.ai_commentary_end_of_round || '1',
      }),
    });
    setSaving(false);
    setMsg('Saved!');
    setTimeout(() => setMsg(''), 2000);
  };

  const regenCode = async () => {
    const r = await api('/admin/invite-code/regenerate', { method: 'POST' });
    const data = await r.json();
    setSettings((s) => ({ ...s, invite_code: data.invite_code }));
  };

  if (!settings) return <div className="text-slate-400 py-8 text-center">Loading...</div>;

  return (
    <div className="space-y-6 max-w-lg">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Initial Timer (sec)</label>
          <input
            type="number" min="10" max="300"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            value={settings.auction_timer_seconds}
            onChange={(e) => setSettings((s) => ({ ...s, auction_timer_seconds: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Grace Period (sec)</label>
          <input
            type="number" min="5" max="120"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            value={settings.auction_grace_seconds}
            onChange={(e) => setSettings((s) => ({ ...s, auction_grace_seconds: e.target.value }))}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Auction Team Order</label>
        <select
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          value={settings.auction_order || 'random'}
          onChange={(e) => setSettings((s) => ({ ...s, auction_order: e.target.value }))}
        >
          <option value="random">Random (shuffled)</option>
          <option value="seed_asc">Best First — 1-seeds → 16-seeds</option>
          <option value="seed_desc">Worst First — 16-seeds → 1-seeds</option>
          <option value="region">By Region — East, West, South, Midwest</option>
        </select>
        <p className="text-xs text-slate-500 mt-1">
          Reorders all pending (unsold) teams when saved. Has no effect on teams already sold or currently bidding.
        </p>
      </div>

      <div className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-3">
        <div>
          <div className="text-sm font-medium text-slate-300">Auto-Advance After Sale</div>
          <div className="text-xs text-slate-500 mt-0.5">
            Automatically start the next team 3 seconds after each successful sale
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.auction_auto_advance === '1'}
          onClick={() => setSettings((s) => ({ ...s, auction_auto_advance: s.auction_auto_advance === '1' ? '0' : '1' }))}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none shrink-0 ml-4 ${
            settings.auction_auto_advance === '1' ? 'bg-orange-500' : 'bg-slate-600'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            settings.auction_auto_advance === '1' ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      </div>

      {/* AI Features group */}
      <div className="border border-slate-700 rounded-xl overflow-hidden">
        <div className="bg-slate-700/50 px-4 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-orange-400">AI Features</span>
        </div>
        <div className="divide-y divide-slate-700">
          <div className="flex items-center justify-between bg-slate-800 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-300">AI Commentary After Sale</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Generate AI play-by-play commentary after each team is sold
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.ai_commentary_after_sale !== '0'}
              onClick={() => setSettings((s) => ({ ...s, ai_commentary_after_sale: s.ai_commentary_after_sale === '0' ? '1' : '0' }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none shrink-0 ml-4 ${
                settings.ai_commentary_after_sale !== '0' ? 'bg-orange-500' : 'bg-slate-600'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                settings.ai_commentary_after_sale !== '0' ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
          <div className="flex items-center justify-between bg-slate-800 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-300">AI Commentary End of Round</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Generate AI recap commentary at the end of each tournament round
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.ai_commentary_end_of_round !== '0'}
              onClick={() => setSettings((s) => ({ ...s, ai_commentary_end_of_round: s.ai_commentary_end_of_round === '0' ? '1' : '0' }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none shrink-0 ml-4 ${
                settings.ai_commentary_end_of_round !== '0' ? 'bg-orange-500' : 'bg-slate-600'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                settings.ai_commentary_end_of_round !== '0' ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-300 mb-1">Invite Code</label>
          <div className="flex gap-2">
            <div className="bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white font-mono tracking-widest text-lg flex-1">
              {settings.invite_code}
            </div>
            <button
              onClick={regenCode}
              className="bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-lg text-sm"
            >
              Regenerate
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold px-6 py-2 rounded-lg"
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
      {msg && <span className="text-green-400 text-sm ml-3">{msg}</span>}
    </div>
  );
}

function PayoutsTab() {
  const [payouts, setPayouts] = useState([]);
  const [previewPot, setPreviewPot] = useState('');
  const [saving, setSaving] = useState(false);
  const [recalcing, setRecalcing] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api('/admin/payouts').then((r) => r.json()).then(setPayouts);
    // Load current pot for preview
    fetch('/api/standings', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (d.totalPot > 0) setPreviewPot(String(d.totalPot)); });
  }, []);

  const pot = parseFloat(previewPot) || 0;

  const resolvedAmount = (p) => {
    const val = parseFloat(p.amount) || 0;
    if (p.payout_type === 'percent') return pot > 0 ? (val / 100) * pot : null;
    return val;
  };

  const totalFixed = payouts
    .filter((p) => p.payout_type === 'fixed')
    .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const totalPercent = payouts
    .filter((p) => p.payout_type === 'percent')
    .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

  const save = async () => {
    setSaving(true);
    await api('/admin/payouts', {
      method: 'PATCH',
      body: JSON.stringify({
        payouts: payouts.map((p) => ({
          round_number: p.round_number,
          amount: parseFloat(p.amount) || 0,
          payout_type: p.payout_type || 'fixed',
        })),
      }),
    });
    setSaving(false);
    setMsg('Saved!');
    setTimeout(() => setMsg(''), 2000);
  };

  const recalc = async () => {
    setRecalcing(true);
    await api('/admin/payouts/recalc', { method: 'POST' });
    setRecalcing(false);
    setMsg('Earnings recalculated!');
    setTimeout(() => setMsg(''), 2500);
  };

  const setType = (i, type) => {
    const updated = [...payouts];
    updated[i] = { ...updated[i], payout_type: type, amount: '' };
    setPayouts(updated);
  };

  return (
    <div className="max-w-xl space-y-5">
      <p className="text-slate-400 text-sm">
        Set a <span className="text-white font-medium">fixed dollar amount</span> or a{' '}
        <span className="text-white font-medium">% of the total pot</span> for each round a team wins.
        Mix and match per round.
      </p>

      {/* Optional pot preview */}
      <div className="flex items-center gap-3 bg-slate-800 rounded-lg px-4 py-3">
        <span className="text-slate-400 text-sm shrink-0">Preview with pot size:</span>
        <div className="relative w-36">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
          <input
            type="number" min="0" step="10" placeholder="e.g. 500"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-7 pr-3 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            value={previewPot}
            onChange={(e) => setPreviewPot(e.target.value)}
          />
        </div>
        {pot > 0 && <span className="text-slate-500 text-xs">showing $ equivalent for % rows</span>}
      </div>

      {/* Per-round rows */}
      <div className="space-y-2">
        {payouts.map((p, i) => {
          const isPercent = p.payout_type === 'percent';
          const preview = resolvedAmount(p);
          return (
            <div key={p.id} className="flex items-center gap-3 bg-slate-800 rounded-lg px-4 py-3">
              {/* Round label */}
              <span className="text-slate-300 text-sm w-28 shrink-0">{p.round_name}</span>

              {/* Type toggle */}
              <div className="flex rounded-lg overflow-hidden border border-slate-600 shrink-0">
                <button
                  onClick={() => setType(i, 'fixed')}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                    !isPercent ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  $
                </button>
                <button
                  onClick={() => setType(i, 'percent')}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isPercent ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  %
                </button>
              </div>

              {/* Amount input */}
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                  {isPercent ? '%' : '$'}
                </span>
                <input
                  type="number" min="0" step={isPercent ? '0.1' : '1'}
                  max={isPercent ? '100' : undefined}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-8 pr-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  value={p.amount}
                  onChange={(e) => {
                    const updated = [...payouts];
                    updated[i] = { ...p, amount: e.target.value };
                    setPayouts(updated);
                  }}
                  placeholder="0"
                />
              </div>

              {/* $ equivalent preview for percent rows */}
              {isPercent && pot > 0 && preview !== null && (
                <span className="text-slate-400 text-xs shrink-0 w-16 text-right">
                  ≈ {fmt(preview)}
                </span>
              )}
              {(!isPercent || pot === 0) && <span className="w-16 shrink-0" />}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="bg-slate-800/60 rounded-lg px-4 py-3 text-sm space-y-1">
        {totalFixed > 0 && (
          <div className="flex justify-between text-slate-300">
            <span>Fixed payouts (per winning team)</span>
            <span className="font-semibold text-white">{fmt(totalFixed)}</span>
          </div>
        )}
        {totalPercent > 0 && (
          <div className="flex justify-between text-slate-300">
            <span>Percentage payouts</span>
            <span className="font-semibold text-white">{totalPercent.toFixed(1)}% of pot</span>
          </div>
        )}
        {totalPercent > 0 && pot > 0 && (
          <div className="flex justify-between text-slate-400 text-xs border-t border-slate-700 pt-1 mt-1">
            <span>% payouts at {fmt(pot)} pot</span>
            <span>≈ {fmt((totalPercent / 100) * pot)} total</span>
          </div>
        )}
        {totalFixed === 0 && totalPercent === 0 && (
          <span className="text-slate-500">No payouts configured yet.</span>
        )}
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={save}
          disabled={saving || recalcing}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold px-6 py-2 rounded-lg"
        >
          {saving ? 'Saving...' : 'Save Payouts'}
        </button>
        <button
          onClick={recalc}
          disabled={saving || recalcing}
          className="bg-slate-600 hover:bg-slate-500 disabled:opacity-60 text-white font-semibold px-4 py-2 rounded-lg text-sm"
          title="Wipe and recompute all earnings from completed games using current payout config"
        >
          {recalcing ? 'Recalculating…' : '↻ Recalculate Earnings'}
        </button>
        {msg && <span className="text-green-400 text-sm">{msg}</span>}
      </div>
    </div>
  );
}

function AuctionTab() {
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
        <div className="bg-orange-900/40 border border-orange-600 rounded-xl p-4">
          <p className="text-xs uppercase tracking-wider text-orange-400 mb-2">Currently Up for Bid</p>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-orange-400 font-bold shrink-0">#{active.seed}</span>
              <span className="text-white font-bold truncate">{active.team_name}</span>
              <span className="text-slate-400 text-sm shrink-0">{active.region}</span>
            </div>
            <div className="flex items-center gap-5 shrink-0">
              <div className="text-right">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Current Bid</div>
                <div className="text-white font-bold">{fmt(active.current_price || 0)}</div>
                {active.leader_name && <div className="text-slate-400 text-xs">{active.leader_name}</div>}
              </div>
              <TimeLeft endTime={active.bid_end_time} />
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-slate-800 rounded-lg p-3">
          <div className="text-2xl font-bold text-orange-400">{pending.length}</div>
          <div className="text-xs text-slate-400 mt-1">Pending</div>
        </div>
        <div className="bg-slate-800 rounded-lg p-3">
          <div className="text-2xl font-bold text-green-400">{sold.length}</div>
          <div className="text-xs text-slate-400 mt-1">Sold</div>
        </div>
        <div className="bg-slate-800 rounded-lg p-3">
          <div className="text-2xl font-bold text-white">
            {fmt(sold.reduce((s, i) => s + (i.final_price || 0), 0))}
          </div>
          <div className="text-xs text-slate-400 mt-1">Total Pot</div>
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
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  filterRegion === r ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filtered.map((item) => (
              <div key={item.id} className="bg-slate-800 rounded-lg p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-orange-400 font-bold text-sm shrink-0">#{item.seed}</span>
                  <span className="text-white text-sm truncate">{item.team_name}</span>
                  <span className="text-slate-500 text-xs shrink-0">{item.region}</span>
                </div>
                <button
                  onClick={() => startNext(item.team_id)}
                  disabled={!!active || auctionStatus !== 'open'}
                  className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-xs font-bold px-3 py-1.5 rounded shrink-0"
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

function BracketAdminTab() {
  const [games, setGames] = useState([]);
  const [tournamentStarted, setTournamentStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const load = () => {
    Promise.all([
      api('/bracket').then((r) => r.json()),
      api('/admin/settings').then((r) => r.json()),
    ]).then(([bracketData, settings]) => {
      setGames(bracketData.games || []);
      setTournamentStarted(settings.tournament_started === '1');
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const flashMsg = (text) => { setMsg(text); setTimeout(() => setMsg(''), 3000); };

  const initBracket = async () => {
    const r = await api('/admin/bracket/initialize', { method: 'POST' });
    const data = await r.json();
    if (!r.ok) { flashMsg(data.error); return; }
    flashMsg('Bracket initialized!');
    load();
  };

  const resetBracket = async () => {
    if (!confirm('Reset all game results? This cannot be undone.')) return;
    await api('/admin/bracket/reset', { method: 'POST' });
    flashMsg('Bracket reset');
    load();
  };

  const setWinner = async (gameId, winnerId) => {
    const r = await api('/bracket/result', { method: 'POST', body: JSON.stringify({ gameId, winnerId }) });
    const data = await r.json();
    if (!r.ok) { flashMsg(data.error); return; }
    load();
  };

  const unsetWinner = async (gameId) => {
    await api('/bracket/unset', { method: 'POST', body: JSON.stringify({ gameId }) });
    load();
  };

  if (loading) return <div className="text-slate-400 py-8 text-center">Loading...</div>;

  const gamesByRound = {};
  for (const g of games) {
    if (!gamesByRound[g.round]) gamesByRound[g.round] = [];
    gamesByRound[g.round].push(g);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center">
        {!tournamentStarted ? (
          <button onClick={initBracket} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2 rounded-lg">
            Initialize Bracket
          </button>
        ) : (
          <button onClick={resetBracket} className="bg-red-700 hover:bg-red-800 text-white font-bold px-5 py-2 rounded-lg">
            Reset All Results
          </button>
        )}
        {msg && <span className="text-green-400 text-sm">{msg}</span>}
      </div>

      {!tournamentStarted ? (
        <p className="text-slate-400">Initialize the bracket to start entering results.</p>
      ) : (
        <div className="space-y-8">
          {Object.entries(gamesByRound).map(([round, roundGames]) => (
            <div key={round}>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-orange-400 mb-3">
                {ROUND_NAMES[parseInt(round) - 1]}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {roundGames.map((game) => (
                  <GameRow key={game.id} game={game} onSetWinner={setWinner} onUnset={unsetWinner} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GameRow({ game, onSetWinner, onUnset }) {
  const hasResult = !!game.winner_id;

  if (!game.team1_id && !game.team2_id) return null;

  return (
    <div className={`bg-slate-800 rounded-lg p-3 ${hasResult ? 'opacity-70' : ''}`}>
      <div className="text-xs text-slate-500 mb-2">{game.region} · R{game.round} G{game.position}</div>
      <div className="space-y-1.5">
        {[
          { id: game.team1_id, name: game.team1_name, seed: game.team1_seed, owner: game.team1_owner_name, color: game.team1_owner_color },
          { id: game.team2_id, name: game.team2_name, seed: game.team2_seed, owner: game.team2_owner_name, color: game.team2_owner_color },
        ].filter((t) => t.id).map((team) => {
          const isWinner = game.winner_id === team.id;
          return (
            <button
              key={team.id}
              onClick={() => hasResult ? null : onSetWinner(game.id, team.id)}
              disabled={hasResult}
              className={`w-full flex items-center justify-between px-3 py-2 rounded transition-colors text-left ${
                isWinner
                  ? 'bg-green-800 border border-green-600'
                  : hasResult
                  ? 'bg-slate-700 opacity-50'
                  : 'bg-slate-700 hover:bg-slate-600 cursor-pointer'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-xs">#{team.seed}</span>
                <span className="text-white text-sm font-medium">{team.name}</span>
                {team.owner && (
                  <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ color: team.color, backgroundColor: team.color + '22' }}>
                    {team.owner}
                  </span>
                )}
              </div>
              {isWinner && <span className="text-green-400 text-xs font-bold">WIN</span>}
            </button>
          );
        })}
      </div>
      {hasResult && (
        <button onClick={() => onUnset(game.id)} className="mt-2 text-xs text-slate-500 hover:text-red-400 transition-colors">
          ↩ Undo result
        </button>
      )}
    </div>
  );
}

function TeamsTab() {
  const [teams, setTeams] = useState([]);
  const [importGrid, setImportGrid] = useState(null);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api('/bracket').then((r) => r.json()).then((d) => {
      // Get teams via standings ownership or direct call
      fetch('/api/auction/items', { credentials: 'include' }).then((r) => r.json()).then(setTeams);
    });
    fetch('/api/auction/items', { credentials: 'include' }).then((r) => r.json()).then(setTeams);
  }, []);

  const initGrid = () => {
    const grid = {};
    REGIONS.forEach((r) => {
      grid[r] = {};
      for (let s = 1; s <= 16; s++) grid[r][s] = '';
    });
    // Pre-fill with current teams
    teams.forEach((t) => { if (grid[t.region]) grid[t.region][t.seed] = t.team_name; });
    setImportGrid(grid);
  };

  const saveImport = async () => {
    const teamList = [];
    for (const region of REGIONS) {
      for (let seed = 1; seed <= 16; seed++) {
        const name = importGrid[region][seed]?.trim();
        if (!name) { setMsg(`Missing: ${region} #${seed}`); return; }
        teamList.push({ name, seed, region });
      }
    }
    setImporting(true);
    const r = await api('/admin/teams/import', { method: 'POST', body: JSON.stringify({ teams: teamList }) });
    const data = await r.json();
    setImporting(false);
    if (!r.ok) { setMsg(data.error); return; }
    setMsg('Teams imported! Auction reset.');
    setImportGrid(null);
    fetch('/api/auction/items', { credentials: 'include' }).then((r) => r.json()).then(setTeams);
  };

  return (
    <div className="space-y-4">
      <p className="text-slate-400 text-sm">
        The 2025 bracket is pre-loaded. Use Import to replace all teams with the 2026 bracket after Selection Sunday (March 15, 2026).
      </p>

      {!importGrid ? (
        <button onClick={initGrid} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2 rounded-lg">
          Import New Bracket (2026)
        </button>
      ) : (
        <div className="space-y-6">
          <div className="bg-yellow-900/40 border border-yellow-700 rounded-lg p-3 text-yellow-300 text-sm">
            Warning: Importing will reset the auction. Only do this before bidding starts.
          </div>

          {REGIONS.map((region) => (
            <div key={region}>
              <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-2">{region} Region</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Array.from({ length: 16 }, (_, i) => i + 1).map((seed) => (
                  <div key={seed} className="flex items-center gap-1.5">
                    <span className="text-slate-500 text-xs w-4 shrink-0">#{seed}</span>
                    <input
                      className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
                      value={importGrid[region][seed]}
                      onChange={(e) => setImportGrid((g) => ({ ...g, [region]: { ...g[region], [seed]: e.target.value } }))}
                      placeholder={`Seed ${seed}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex gap-3">
            <button onClick={saveImport} disabled={importing} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold px-6 py-2 rounded-lg">
              {importing ? 'Importing...' : 'Confirm Import'}
            </button>
            <button onClick={() => setImportGrid(null)} className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      )}

      {msg && <p className="text-green-400 text-sm">{msg}</p>}

      {/* Current teams summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
        {REGIONS.map((region) => (
          <div key={region} className="bg-slate-800 rounded-lg p-3">
            <div className="text-xs font-semibold text-orange-400 uppercase mb-2">{region}</div>
            {teams
              .filter((t) => t.region === region)
              .sort((a, b) => a.seed - b.seed)
              .map((t) => (
                <div key={t.id} className="flex items-center gap-1.5 py-0.5">
                  <span className="text-slate-500 text-xs w-4">#{t.seed}</span>
                  <span className="text-slate-200 text-xs truncate">{t.team_name}</span>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ParticipantsTab() {
  const [participants, setParticipants] = useState([]);

  useEffect(() => {
    api('/admin/participants').then((r) => r.json()).then(setParticipants);
  }, []);

  const remove = async (id) => {
    if (!confirm('Remove this participant?')) return;
    await api(`/admin/participants/${id}`, { method: 'DELETE' });
    setParticipants((p) => p.filter((x) => x.id !== id));
  };

  return (
    <div className="space-y-2 max-w-md">
      {participants.map((p) => (
        <div key={p.id} className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-3">
          <div className="flex items-center gap-3">
            <span
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: p.color }}
            >
              {p.name[0].toUpperCase()}
            </span>
            <div>
              <div className="text-white font-medium text-sm">{p.name}</div>
              {p.is_admin ? <span className="text-xs text-orange-400">Admin</span> : null}
            </div>
          </div>
          {!p.is_admin && (
            <button onClick={() => remove(p.id)} className="text-slate-500 hover:text-red-400 text-xs transition-colors">
              Remove
            </button>
          )}
        </div>
      ))}
      {participants.length === 0 && <p className="text-slate-400 text-sm">No participants yet.</p>}
    </div>
  );
}

// ──────────────────────── Tournaments Tab ────────────────────────

function TournamentsTab() {
  const { allTournaments, activeTournamentId, refreshTournaments } = useTournament() ?? {};
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [activating, setActivating] = useState(null);
  const [msg, setMsg] = useState('');

  const flashMsg = (text) => { setMsg(text); setTimeout(() => setMsg(''), 4000); };

  const createTournament = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const r = await api('/tournaments', { method: 'POST', body: JSON.stringify({ name: newName.trim() }) });
    const data = await r.json();
    setCreating(false);
    if (!r.ok) { flashMsg(data.error || 'Failed to create tournament'); return; }
    setNewName('');
    refreshTournaments?.();
    flashMsg(`Tournament "${data.tournament.name}" created! Invite code: ${data.tournament.invite_code}`);
  };

  const activate = async (id, name) => {
    if (!confirm(`Switch active tournament to "${name}"? All participants will immediately see this tournament.`)) return;
    setActivating(id);
    await api(`/tournaments/${id}/activate`, { method: 'POST' });
    setActivating(null);
    refreshTournaments?.();
    flashMsg(`Switched to "${name}"`);
  };

  const formatDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString() : '—';

  return (
    <div className="space-y-6 max-w-2xl">
      <p className="text-slate-400 text-sm">
        Create and manage tournaments. Only one tournament is active at a time — all participants see the active tournament.
        Past tournaments remain viewable as read-only archives.
      </p>

      {/* Create new tournament */}
      <div className="bg-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-orange-400">Create New Tournament</h3>
        <div className="flex gap-3">
          <input
            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="e.g. March Madness 2026"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createTournament()}
          />
          <button
            onClick={createTournament}
            disabled={creating || !newName.trim()}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold px-5 py-2 rounded-lg shrink-0"
          >
            {creating ? 'Creating…' : '+ Create'}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          A new tournament is pre-loaded with the 2025 teams. Use Teams / Import to load the actual 2026 bracket after Selection Sunday.
          The tournament is <strong className="text-slate-300">not</strong> automatically activated — set it as Active when ready.
        </p>
      </div>

      {msg && <div className="bg-blue-900/50 border border-blue-700 rounded-lg px-4 py-3 text-blue-300 text-sm">{msg}</div>}

      {/* Tournament list */}
      <div className="space-y-2">
        {(allTournaments || []).map((t) => {
          const isActive = t.id === activeTournamentId;
          return (
            <div
              key={t.id}
              className={`rounded-xl p-4 flex items-center justify-between gap-4 ${
                isActive ? 'bg-orange-900/30 border border-orange-600' : 'bg-slate-800 border border-slate-700'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-semibold">{t.name}</span>
                  {isActive && (
                    <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded font-medium">ACTIVE</span>
                  )}
                </div>
                <div className="flex gap-4 mt-1 text-xs text-slate-500 flex-wrap">
                  <span>Created {formatDate(t.created_at)}</span>
                  <span>{t.participant_count} participant{t.participant_count !== 1 ? 's' : ''}</span>
                  <span className="font-mono">Invite: <span className="text-slate-300">{t.invite_code}</span></span>
                  <span className={`capitalize ${
                    t.auction_status === 'complete' ? 'text-blue-400' :
                    t.auction_status === 'open' ? 'text-green-400' :
                    'text-slate-400'
                  }`}>{t.auction_status}</span>
                </div>
              </div>
              {!isActive && (
                <button
                  onClick={() => activate(t.id, t.name)}
                  disabled={activating === t.id}
                  className="bg-slate-600 hover:bg-slate-500 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg shrink-0"
                >
                  {activating === t.id ? 'Switching…' : 'Set as Active'}
                </button>
              )}
            </div>
          );
        })}
        {(!allTournaments || allTournaments.length === 0) && (
          <p className="text-slate-400 text-sm">No tournaments yet.</p>
        )}
      </div>
    </div>
  );
}

// ──────────────────────── Main Admin ────────────────────────

const TABS = [
  { id: 'tournaments', label: 'Tournaments' },
  { id: 'auction', label: 'Auction' },
  { id: 'bracket', label: 'Bracket Results' },
  { id: 'payouts', label: 'Payouts' },
  { id: 'teams', label: 'Teams / Import' },
  { id: 'participants', label: 'Participants' },
  { id: 'settings', label: 'Settings' },
];

export default function Admin() {
  const [tab, setTab] = useState('auction');

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Admin Dashboard</h1>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 mb-8 bg-slate-800 rounded-xl p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-orange-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div>
        {tab === 'tournaments' && <TournamentsTab />}
        {tab === 'auction' && <AuctionTab />}
        {tab === 'bracket' && <BracketAdminTab />}
        {tab === 'payouts' && <PayoutsTab />}
        {tab === 'teams' && <TeamsTab />}
        {tab === 'participants' && <ParticipantsTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
}
