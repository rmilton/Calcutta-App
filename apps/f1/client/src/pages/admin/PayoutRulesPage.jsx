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

export function PayoutRulesContent({ rules, updateRules, saveRules, loading, hasLoaded }) {
  const [isLocked, setIsLocked] = useState(true);

  const gpTotal = useMemo(() => (rules?.grand_prix || []).reduce((sum, rule) => sum + Number(rule.bps || 0), 0), [rules]);
  const sprintTotal = useMemo(() => (rules?.sprint || []).reduce((sum, rule) => sum + Number(rule.bps || 0), 0), [rules]);
  const bonusTotal = useMemo(() => (rules?.season_bonus || []).reduce((sum, rule) => sum + Number(rule.bps || 0), 0), [rules]);

  if (loading && !hasLoaded) {
    return <AdminLoadingState />;
  }

  if (!rules) {
    return <p className="muted">No payout rules found.</p>;
  }

  return (
    <div className="stack">
      <div className="row between wrap gap-sm">
        <p className="muted small">1% = 100 bps. Targets: GP 350 bps, Sprint 150 bps, Season bonus 700 bps.</p>
        <button
          type="button"
          className={`btn ${isLocked ? '' : 'btn-outline'}`}
          onClick={() => setIsLocked((prev) => !prev)}
        >
          {isLocked ? 'Unlock Editing' : 'Lock Editing'}
        </button>
      </div>
      {!isLocked && (
        <p className="muted small">Editing enabled — save your changes, then lock again.</p>
      )}

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
                <td><input value={rule.bps} disabled={isLocked} onChange={(e) => updateRules('grand_prix', rule.id, 'bps', e.target.value)} /></td>
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
                <td><input value={rule.bps} disabled={isLocked} onChange={(e) => updateRules('sprint', rule.id, 'bps', e.target.value)} /></td>
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
                <td><input value={rule.bps} disabled={isLocked} onChange={(e) => updateRules('season_bonus', rule.id, 'bps', e.target.value)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="btn btn-outline" onClick={saveRules} disabled={isLocked}>Save Rules</button>
    </div>
  );
}

export default function PayoutRulesPage() {
  const { rules, updateRules, saveRules, loading, hasLoaded } = useAdminOutletContext();
  return (
    <section className="panel stack">
      <h2>Payout Rules</h2>
      <PayoutRulesContent rules={rules} updateRules={updateRules} saveRules={saveRules} loading={loading} hasLoaded={hasLoaded} />
    </section>
  );
}
