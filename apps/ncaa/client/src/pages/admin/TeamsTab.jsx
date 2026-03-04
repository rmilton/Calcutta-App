import React, { useState, useEffect } from 'react';
import { api, REGIONS } from '../../utils';

export default function TeamsTab() {
  const [teams, setTeams] = useState([]);
  const [importGrid, setImportGrid] = useState(null);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState('');

  const loadTeams = () => {
    api('/auction/items').then((r) => r.json()).then(setTeams);
  };

  useEffect(() => { loadTeams(); }, []);

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
    loadTeams();
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
