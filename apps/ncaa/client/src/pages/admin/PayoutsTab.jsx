import React, { useState, useEffect } from 'react';
import { fmt, api } from '../../utils';

export default function PayoutsTab() {
  const [payouts, setPayouts] = useState([]);
  const [previewPot, setPreviewPot] = useState('');
  const [saving, setSaving] = useState(false);
  const [recalcing, setRecalcing] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api('/admin/payouts').then((r) => r.json()).then(setPayouts);
    // Load current pot for preview
    api('/standings')
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
