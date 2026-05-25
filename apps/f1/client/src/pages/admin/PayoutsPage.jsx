import React, { useState } from 'react';
import useAdminOutletContext from './useAdminOutletContext';
import { PayoutAuditContent } from './PayoutAuditPage';
import { PayoutRulesContent } from './PayoutRulesPage';

export default function PayoutsPage() {
  const { events, rules, updateRules, saveRules, loading, hasLoaded } = useAdminOutletContext();
  const [tab, setTab] = useState('audit');

  return (
    <div className="stack-lg">
      <div className="admin-tab-bar">
        <button
          type="button"
          className={`admin-tab-btn ${tab === 'audit' ? 'active' : ''}`}
          onClick={() => setTab('audit')}
        >
          Payout Audit
        </button>
        <button
          type="button"
          className={`admin-tab-btn ${tab === 'rules' ? 'active' : ''}`}
          onClick={() => setTab('rules')}
        >
          Payout Rules
        </button>
      </div>

      <section className="panel stack-lg">
        {tab === 'audit' ? (
          <PayoutAuditContent events={events} loading={loading} hasLoaded={hasLoaded} />
        ) : (
          <PayoutRulesContent rules={rules} updateRules={updateRules} saveRules={saveRules} loading={loading} hasLoaded={hasLoaded} />
        )}
      </section>
    </div>
  );
}
