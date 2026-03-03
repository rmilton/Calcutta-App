import React, { useState, useEffect } from 'react';
import { fmt, api } from '../../utils';

// Unix ms → value string for <input type="datetime-local">
const msToDatetimeLocal = (ms) => {
  if (!ms) return '';
  const d = new Date(parseInt(ms));
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
// datetime-local string → Unix ms (or '' to clear)
const datetimeLocalToMs = (val) => (val ? String(new Date(val).getTime()) : '');

export default function SettingsTab() {
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
        ai_commentary_enabled: settings.ai_commentary_enabled ?? '1',
        auction_scheduled_start: settings.auction_scheduled_start || '',
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

  const downloadCsv = async () => {
    const r = await api('/admin/export/csv');
    if (!r.ok) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calcutta-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
          aria-label="Auto-advance after sale"
          onClick={() => setSettings((s) => ({ ...s, auction_auto_advance: s.auction_auto_advance === '1' ? '0' : '1' }))}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ml-4 ${
            settings.auction_auto_advance === '1' ? 'bg-orange-500' : 'bg-slate-600'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            settings.auction_auto_advance === '1' ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      </div>

      <div className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-3">
        <div>
          <div className="text-sm font-medium text-slate-300">AI Commentary After Sale</div>
          <div className="text-xs text-slate-500 mt-0.5">
            Show an AI-generated quip after each team sells at auction
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.ai_commentary_enabled !== '0'}
          aria-label="AI commentary after sale"
          onClick={() => setSettings((s) => ({ ...s, ai_commentary_enabled: s.ai_commentary_enabled === '0' ? '1' : '0' }))}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ml-4 ${
            settings.ai_commentary_enabled !== '0' ? 'bg-orange-500' : 'bg-slate-600'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            settings.ai_commentary_enabled !== '0' ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      </div>

      <div className="bg-slate-800 rounded-lg px-4 py-3 space-y-2">
        <div className="text-sm font-medium text-slate-300">Scheduled Auction Start</div>
        <div className="text-xs text-slate-500">
          Automatically open the auction at this date &amp; time. Leave blank to open manually.
        </div>
        <input
          type="datetime-local"
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          value={msToDatetimeLocal(settings.auction_scheduled_start)}
          onChange={(e) => setSettings((s) => ({ ...s, auction_scheduled_start: datetimeLocalToMs(e.target.value) }))}
        />
        {settings.auction_scheduled_start && (
          <button
            type="button"
            onClick={() => setSettings((s) => ({ ...s, auction_scheduled_start: '' }))}
            className="text-xs text-slate-500 hover:text-red-400 transition-colors"
          >
            ✕ Clear schedule
          </button>
        )}
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

      <div className="border-t border-slate-700 pt-6">
        <div className="text-sm font-medium text-slate-300 mb-1">Export Results</div>
        <div className="text-xs text-slate-500 mb-3">
          Download standings and auction results as a CSV for settling up outside the app.
        </div>
        <button
          type="button"
          onClick={downloadCsv}
          className="btn-secondary gap-2"
        >
          <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download CSV
        </button>
      </div>

      <button onClick={save} disabled={saving} className="btn-primary">
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
      {msg && <span className="text-status-success text-sm ml-3">{msg}</span>}
    </div>
  );
}
