import React, { useMemo, useState } from 'react';
import { categoryLabel } from '../../utils';
import AdminLoadingState from './AdminLoadingState';
import useAdminOutletContext from './useAdminOutletContext';

const TARGETS = {
  grand_prix: 350,
  sprint: 150,
  season_bonus: 700,
};

function totalDelta(total, target) {
  const delta = total - target;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta}`;
}

export default function PayoutRulesPage() {
  const { rules, updateRules, saveRules, loading, hasLoaded } = useAdminOutletContext();
  const [isLocked, setIsLocked] = useState(true);

  const gpTotal = useMemo(() => (rules?.grand_prix || []).reduce((sum, rule) => sum + Number(rule.bps || 0), 0), [rules]);
  const sprintTotal = useMemo(() => (rules?.sprint || []).reduce((sum, rule) => sum + Number(rule.bps || 0), 0), [rules]);
  const bonusTotal = useMemo(() => (rules?.season_bonus || []).reduce((sum, rule) => sum + Number(rule.bps || 0), 0), [rules]);

  if (loading && !hasLoaded) {
    return <AdminLoadingState />;
  }

  if (!rules) {
    return <section className="loading-panel">No payout rules found.</section>;
  }

  return (
    <section className="panel stack">
      <div className="row between wrap gap-sm">
        <div>
          <h2>Payout Rules</h2>
          <p className="muted">1% = 100 bps. Targets: GP 350 bps, Sprint 150 bps, Season bonus 700 bps.</p>
        </div>
        <div className="row wrap gap-sm payout-lock-controls">
          <span className={`bps-lock-pill ${isLocked ? 'locked' : 'unlocked'}`}>
            {isLocked ? 'Locked' : 'Unlocked'}
          </span>
          <button
            type="button"
            className={`btn ${isLocked ? '' : 'btn-outline'}`}
            onClick={() => setIsLocked((prev) => !prev)}
          >
            {isLocked ? 'Unlock BPS Editing' : 'Lock BPS Editing'}
          </button>
        </div>
      </div>
      <p className="muted small">
        {isLocked
          ? 'Editing is locked to prevent accidental rule changes.'
          : 'Editing is enabled. Save your changes, then lock editing again.'}
      </p>

      <div className="bps-summary">
        <h3>Grand Prix</h3>
        <span className={`bps-pill ${gpTotal === TARGETS.grand_prix ? 'ok' : 'warn'}`}>
          {gpTotal} bps ({totalDelta(gpTotal, TARGETS.grand_prix)})
        </span>
      </div>
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
                    disabled={isLocked}
                    onChange={(e) => updateRules('grand_prix', rule.id, 'bps', e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bps-summary">
        <h3>Sprint</h3>
        <span className={`bps-pill ${sprintTotal === TARGETS.sprint ? 'ok' : 'warn'}`}>
          {sprintTotal} bps ({totalDelta(sprintTotal, TARGETS.sprint)})
        </span>
      </div>
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
                    disabled={isLocked}
                    onChange={(e) => updateRules('sprint', rule.id, 'bps', e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bps-summary">
        <h3>Season Bonuses</h3>
        <span className={`bps-pill ${bonusTotal === TARGETS.season_bonus ? 'ok' : 'warn'}`}>
          {bonusTotal} bps ({totalDelta(bonusTotal, TARGETS.season_bonus)})
        </span>
      </div>
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
                    disabled={isLocked}
                    onChange={(e) => updateRules('season_bonus', rule.id, 'bps', e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="btn" onClick={saveRules} disabled={isLocked}>Save Rules</button>
    </section>
  );
}
