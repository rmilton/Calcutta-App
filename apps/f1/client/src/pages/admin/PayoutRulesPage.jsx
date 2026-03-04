import React, { useMemo } from 'react';
import { categoryLabel } from '../../utils';
import useAdminOutletContext from './useAdminOutletContext';

export default function PayoutRulesPage() {
  const { rules, updateRules, saveRules, loading, hasLoaded } = useAdminOutletContext();

  const gpTotal = useMemo(() => (rules?.grand_prix || []).reduce((sum, rule) => sum + Number(rule.bps || 0), 0), [rules]);
  const sprintTotal = useMemo(() => (rules?.sprint || []).reduce((sum, rule) => sum + Number(rule.bps || 0), 0), [rules]);
  const bonusTotal = useMemo(() => (rules?.season_bonus || []).reduce((sum, rule) => sum + Number(rule.bps || 0), 0), [rules]);

  if (loading && !hasLoaded) {
    return <section className="loading-panel">Loading admin data...</section>;
  }

  if (!rules) {
    return <section className="loading-panel">No payout rules found.</section>;
  }

  return (
    <section className="panel stack">
      <h2>Payout Rules</h2>
      <p className="muted">1% = 100 bps. GP target 300 bps, Sprint target 100 bps, Season bonus target 10,000 bps.</p>

      <h3>Grand Prix ({gpTotal} bps)</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Category</th><th>BPS</th></tr></thead>
          <tbody>
            {(rules.grand_prix || []).map((rule) => (
              <tr key={rule.id}>
                <td>{categoryLabel(rule.category)}</td>
                <td>
                  <input
                    value={rule.bps}
                    onChange={(e) => updateRules('grand_prix', rule.id, 'bps', e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Sprint ({sprintTotal} bps)</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Category</th><th>BPS</th></tr></thead>
          <tbody>
            {(rules.sprint || []).map((rule) => (
              <tr key={rule.id}>
                <td>{categoryLabel(rule.category)}</td>
                <td>
                  <input
                    value={rule.bps}
                    onChange={(e) => updateRules('sprint', rule.id, 'bps', e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Season Bonuses ({bonusTotal} bps)</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Category</th><th>BPS</th></tr></thead>
          <tbody>
            {(rules.season_bonus || []).map((rule) => (
              <tr key={rule.id}>
                <td>{categoryLabel(rule.category)}</td>
                <td>
                  <input
                    value={rule.bps}
                    onChange={(e) => updateRules('season_bonus', rule.id, 'bps', e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="btn" onClick={saveRules}>Save Rules</button>
    </section>
  );
}
