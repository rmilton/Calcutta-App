import React, { useState } from 'react';
import useAdminOutletContext from './useAdminOutletContext';
import { PayoutAuditContent } from './PayoutAuditPage';
import { PayoutRulesContent } from './PayoutRulesPage';
import { UnallocatedPotContent } from './UnallocatedPotPage';

export default function PayoutsPage() {
  const {
    events,
    rules,
    updateRules,
    saveRules,
    unallocatedPot,
    settings,
    loading,
    hasLoaded,
  } = useAdminOutletContext();
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
          className={`admin-tab-btn ${tab === 'unallocated' ? 'active' : ''}`}
          onClick={() => setTab('unallocated')}
        >
          Unallocated
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
        ) : null}
        {tab === 'unallocated' ? (
          <UnallocatedPotContent unallocatedPot={unallocatedPot} loading={loading} hasLoaded={hasLoaded} settings={settings} />
        ) : null}
        {tab === 'rules' ? (
          <PayoutRulesContent rules={rules} updateRules={updateRules} saveRules={saveRules} loading={loading} hasLoaded={hasLoaded} />
        ) : null}
      </section>
    </div>
  );
}
