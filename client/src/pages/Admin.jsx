import React, { useState } from 'react';
import TournamentsTab from './admin/TournamentsTab';
import AuctionTab from './admin/AuctionTab';
import BracketAdminTab from './admin/BracketAdminTab';
import PayoutsTab from './admin/PayoutsTab';
import TeamsTab from './admin/TeamsTab';
import ParticipantsTab from './admin/ParticipantsTab';
import SettingsTab from './admin/SettingsTab';

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
      <h1 className="text-2xl font-bold text-text-primary mb-6">Admin Dashboard</h1>

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Admin sections"
        className="flex gap-1 bg-surface-input rounded-2xl p-1 overflow-x-auto mb-8 scroll-smooth"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 ${
              tab === t.id
                ? 'bg-surface-raised text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
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
