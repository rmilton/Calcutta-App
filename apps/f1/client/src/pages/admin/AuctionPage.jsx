import React, { useCallback, useMemo, useState } from 'react';
import ParticipantAvatar from '../../components/ParticipantAvatar';
import { useSocketEvent } from '../../context/SocketContext';
import AdminLoadingState from './AdminLoadingState';
import { buildInviteLink } from './adminApi';
import useAdminOutletContext from './useAdminOutletContext';

export default function AuctionPage() {
  const {
    settings,
    participants,
    setField,
    saveSettings,
    saveSettingsPatch,
    runAuctionAction,
    refresh,
    setMessage,
    loading,
    hasLoaded,
  } = useAdminOutletContext();
  const [inviteBusy, setInviteBusy] = useState(false);
  const budgetCapValue = typeof settings?.auction_budget_cap_cents === 'string'
    ? settings.auction_budget_cap_cents
    : String(settings?.auction_budget_cap_cents == null ? 200 : (Number(settings.auction_budget_cap_cents) / 100));
  const isRosterLocked = String(settings?.auction_roster_locked) === '1'
    || settings?.auction_roster_locked === 1
    || settings?.auction_roster_locked === true;
  const joinedParticipants = (participants || []).filter((participant) => !participant.is_admin);
  const inviteLink = useMemo(
    () => buildInviteLink(settings?.invite_code),
    [settings?.invite_code],
  );

  const handleParticipantsUpdate = useCallback(() => {
    refresh({ silent: true });
  }, [refresh]);

  const handleCopyInviteLink = useCallback(async () => {
    if (!inviteLink) return;
    setInviteBusy(true);
    try {
      await navigator.clipboard.writeText(inviteLink);
      setMessage('Invite link copied.');
    } catch (error) {
      setMessage(error.message || 'Failed to copy invite link.');
    } finally {
      setInviteBusy(false);
    }
  }, [inviteLink, setMessage]);

  const handleShareInviteLink = useCallback(async () => {
    if (!inviteLink) return;
    setInviteBusy(true);
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Join the F1 Calcutta',
          text: 'Use this link to join the F1 Calcutta pool.',
          url: inviteLink,
        });
        setMessage('Invite link shared.');
      } else {
        await navigator.clipboard.writeText(inviteLink);
        setMessage('Sharing is not available here. Invite link copied instead.');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setMessage(error.message || 'Failed to share invite link.');
      }
    } finally {
      setInviteBusy(false);
    }
  }, [inviteLink, setMessage]);

  useSocketEvent('participants:update', handleParticipantsUpdate);

  if (loading && !hasLoaded) {
    return <AdminLoadingState />;
  }

  return (
    <div className="stack-lg">
      <section className="panel stack">
        <div className="row wrap gap-sm participants-panel-header">
          <div>
            <h2>Invite Participants</h2>
            <p className="muted">Share the pool link or send the invite code directly.</p>
          </div>
        </div>
        <div className="invite-share-panel stack">
          <div className="invite-share-grid">
            <div className="invite-share-card">
              <span className="label">Invite Code</span>
              <strong>{settings?.invite_code || '—'}</strong>
            </div>
            <div className="invite-share-card invite-share-link-card">
              <span className="label">Shareable Link</span>
              <strong className="invite-share-link">{inviteLink || 'Unavailable'}</strong>
            </div>
          </div>
          <div className="row wrap gap-sm">
            <button
              className="btn"
              type="button"
              onClick={handleCopyInviteLink}
              disabled={!inviteLink || inviteBusy}
            >
              Copy Invite Link
            </button>
            <button
              className="btn btn-outline"
              type="button"
              onClick={handleShareInviteLink}
              disabled={!inviteLink || inviteBusy}
            >
              Share Invite Link
            </button>
          </div>
        </div>
      </section>

      <section className="panel stack">
        <h2>Auction Controls</h2>
        <div className="row wrap gap-sm">
          <button className="btn" onClick={() => runAuctionAction('/admin/auction/start')}>Open</button>
          <button className="btn btn-outline" onClick={() => runAuctionAction('/admin/auction/pause')}>Pause</button>
          <button className="btn btn-outline" onClick={() => runAuctionAction('/admin/auction/next')}>Start Next Driver</button>
          <button className="btn btn-outline" onClick={() => runAuctionAction('/admin/auction/shuffle')}>Shuffle Pending Order</button>
          <button className="btn btn-outline" onClick={() => runAuctionAction('/admin/auction/close')}>Close Active</button>
        </div>
        <div className={`note-panel ${isRosterLocked ? 'note-panel-warning' : ''}`}>
          <strong>Season Roster {isRosterLocked ? 'Locked' : 'Unlocked'}</strong>
          <div className="muted small">
            {isRosterLocked
              ? 'Refresh Drivers is now intended to stay off for the season unless you deliberately unlock the roster.'
              : 'You can still refresh or rebuild the driver roster before the real season starts.'}
          </div>
          <div className="row wrap gap-sm">
            <button
              className="btn btn-outline"
              onClick={() => {
                saveSettingsPatch({ auction_roster_locked: isRosterLocked ? 0 : 1 });
              }}
            >
              {isRosterLocked ? 'Unlock Season Roster' : 'Lock Season Roster'}
            </button>
          </div>
        </div>
      </section>

      <section className="panel stack">
        <h2>Auction Settings</h2>
        <div className="grid-3">
          <label>
            Timer (sec)
            <input
              value={settings?.auction_timer_seconds ?? ''}
              onChange={(e) => setField('auction_timer_seconds', e.target.value)}
            />
          </label>
          <label>
            Grace (sec)
            <input
              value={settings?.auction_grace_seconds ?? ''}
              onChange={(e) => setField('auction_grace_seconds', e.target.value)}
            />
          </label>
          <label>
            Budget Cap ($)
            <input
              type="number"
              min="0"
              step="1"
              value={budgetCapValue}
              onChange={(e) => setField('auction_budget_cap_cents', e.target.value)}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={String(settings?.auction_auto_advance) === '1' || settings?.auction_auto_advance === 1 || settings?.auction_auto_advance === true}
              onChange={(e) => setField('auction_auto_advance', e.target.checked ? 1 : 0)}
            />
            Auto Advance
          </label>
        </div>
        <button className="btn" onClick={saveSettings}>Save Settings</button>
      </section>

      <section className="panel stack">
        <div className="row wrap gap-sm participants-panel-header">
          <div>
            <h2>Joined Participants</h2>
            <p className="muted">Live participant roster for the current auction pool.</p>
          </div>
          <span className="meta-pill">{joinedParticipants.length} joined</span>
        </div>
        {joinedParticipants.length ? (
          <div className="admin-participant-list">
            {joinedParticipants.map((participant) => (
              <div key={participant.id} className="admin-participant-row">
                <div className="row gap-sm admin-participant-identity">
                  <ParticipantAvatar name={participant.name} color={participant.color} size={28} />
                  <div className="stack-xs">
                    <strong>{participant.name}</strong>
                    <span className="muted">Ready for auction</span>
                  </div>
                </div>
                <span
                  className="admin-participant-swatch"
                  style={{ backgroundColor: participant.color }}
                  aria-hidden="true"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="note-panel">
            No non-admin participants have joined yet.
          </div>
        )}
      </section>
    </div>
  );
}
