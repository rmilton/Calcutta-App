import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket, useSocketEvent } from '../context/SocketContext';
import { useTournament } from '../context/TournamentContext';
import CountdownTimer from '../components/CountdownTimer';
import TeamLogo from '../components/TeamLogo';
import ParticipantAvatar from '../components/ParticipantAvatar';
import { fmt, api, REGION_COLORS } from '../utils';


const REGION_BADGE_CLASS = {
  East:    'badge bg-red-500/10 text-red-400 border border-red-500/20',
  West:    'badge bg-blue-500/10 text-blue-400 border border-blue-500/20',
  South:   'badge bg-green-500/10 text-green-400 border border-green-500/20',
  Midwest: 'badge bg-amber-500/10 text-amber-400 border border-amber-500/20',
};

const STATUS_BADGE = {
  open:     <span className="badge badge-success">● LIVE</span>,
  paused:   <span className="badge badge-warning">⏸ PAUSED</span>,
  complete: <span className="badge badge-info">✓ COMPLETE</span>,
  waiting:  <span className="badge badge-neutral">◌ WAITING</span>,
};

function ActiveTeamCard({ item }) {
  return (
    <div className="card-elevated ring-1 ring-brand/30 shadow-glow-sm p-6">
      {/* Region badge */}
      <div className="flex items-center justify-between mb-3">
        <span className={REGION_BADGE_CLASS[item?.region] ?? 'badge badge-neutral'}>
          {item?.region}
        </span>
        <span className="text-text-secondary text-xs">#{item?.seed} seed</span>
      </div>

      {/* Team identity row */}
      <div className="flex items-center gap-4">
        <TeamLogo
          espnId={item?.team_espn_id}
          teamColor={item?.team_color}
          name={item?.team_name}
          seed={item?.seed}
          size={56}
        />
        <div>
          <h2 className="text-2xl font-bold text-text-primary">{item?.team_name}</h2>
        </div>
      </div>
    </div>
  );
}

function SoldByOwner({ items, participantId }) {
  const sold = items.filter((i) => i.status === 'sold');
  if (!sold.length) return null;

  const totalPot = sold.reduce((s, i) => s + (i.final_price || 0), 0);

  const byOwner = {};
  for (const item of sold) {
    const key = item.winner_id;
    if (!byOwner[key]) {
      byOwner[key] = {
        id: item.winner_id,
        name: item.winner_name,
        color: item.winner_color,
        teams: [],
        spent: 0,
      };
    }
    byOwner[key].teams.push(item);
    byOwner[key].spent += item.final_price || 0;
  }

  const groups = Object.values(byOwner).sort((a, b) => {
    if (a.id === participantId) return -1;
    if (b.id === participantId) return 1;
    return b.spent - a.spent;
  });

  const mySpent = byOwner[participantId]?.spent ?? 0;

  return (
    <div className="space-y-4">
      {/* Pot summary */}
      <div className="flex items-center justify-between">
        <h2 className="section-label">Sold Teams</h2>
        <div className="flex items-center gap-4 text-sm">
          {participantId && byOwner[participantId] && (
            <span className="text-text-secondary">
              Your spend: <span className="font-bold text-text-primary tabular-nums">{fmt(mySpent)}</span>
            </span>
          )}
          <span className="text-text-secondary">
            Total pot: <span className="font-bold text-status-success tabular-nums">{fmt(totalPot)}</span>
          </span>
        </div>
      </div>

      {/* One card per owner */}
      {groups.map((group) => {
        const isMe = group.id === participantId;
        return (
          <div
            key={group.id}
            className={`card overflow-hidden ${isMe ? 'ring-1 ring-brand/40' : ''}`}
          >
            {/* Owner header */}
            <div className={`flex items-center justify-between px-4 py-3 border-b border-surface-border ${isMe ? 'bg-brand-muted' : ''}`}>
              <div className="flex items-center gap-2.5">
                <ParticipantAvatar name={group.name} color={group.color} size={28} />
                <span className={`font-semibold text-sm ${isMe ? 'text-brand' : 'text-text-primary'}`}>
                  {isMe ? `${group.name} (You)` : group.name}
                </span>
                <span className="text-text-secondary text-xs">· {group.teams.length} team{group.teams.length !== 1 ? 's' : ''}</span>
              </div>
              <span className="text-sm font-bold text-text-primary tabular-nums">{fmt(group.spent)}</span>
            </div>

            {/* Team rows */}
            <div className="divide-y divide-surface-border/60">
              {group.teams.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                  style={{ borderLeft: `3px solid ${(REGION_COLORS[item.region] ?? '#6366f1') + '66'}` }}
                >
                  <TeamLogo
                    espnId={item.team_espn_id}
                    teamColor={item.team_color}
                    name={item.team_name}
                    seed={item.seed}
                    size={20}
                  />
                  <span className="text-sm text-text-primary flex-1 truncate">{item.team_name}</span>
                  <span className="text-xs text-text-secondary shrink-0">{item.region}</span>
                  <span className="text-sm font-semibold text-text-primary shrink-0 tabular-nums">{fmt(item.final_price)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BidFeed({ bids }) {
  if (!bids?.length) return (
    <p className="text-text-secondary text-sm text-center py-4">No bids yet — be the first!</p>
  );
  return (
    <div className="space-y-1.5 max-h-48 overflow-y-auto">
      {bids.map((bid, i) => (
        <div
          key={bid.id || i}
          className="flex items-center justify-between bg-surface-base/40 rounded-lg px-3 py-2"
          style={{ borderLeft: `3px solid ${bid.color ?? '#6366f1'}` }}
        >
          <div className="flex items-center gap-2">
            <ParticipantAvatar name={bid.participant_name} color={bid.color} size={20} ring={false} />
            <span className="text-text-primary text-sm">{bid.participant_name}</span>
          </div>
          <span className="font-bold text-status-success text-sm tabular-nums">{fmt(bid.amount)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Auction() {
  const { participant } = useAuth();
  const { socket } = useSocket();
  const { isViewingHistory, apiTParam, refreshKey } = useTournament() ?? {};
  const [auctionStatus, setAuctionStatus] = useState('waiting');
  const [active, setActive] = useState(null);
  const [recentBids, setRecentBids] = useState([]);
  const [items, setItems] = useState([]);
  const [bidInput, setBidInput] = useState('');
  const [bidError, setBidError] = useState('');
  const [soldMessage, setSoldMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scheduledStart, setScheduledStart] = useState(null);
  const [countdown, setCountdown] = useState('');
  const [completionSummary, setCompletionSummary] = useState('');
  const [completionSummaryLoading, setCompletionSummaryLoading] = useState(false);

  const refreshItems = useCallback(() => {
    api(`/auction/items${apiTParam || ''}`)
      .then((r) => r.json())
      .then(setItems);
  }, [apiTParam]);

  const refreshAll = useCallback(() => {
    api(`/auction${apiTParam || ''}`)
      .then((r) => r.json())
      .then((data) => {
        setAuctionStatus(data.auctionStatus);
        setActive(data.active);
        setRecentBids(data.recentBids || []);
        setItems(data.items || []);
        setCompletionSummary(data.completionSummary || '');
        if (data.completionSummary) setCompletionSummaryLoading(false);
      });
  }, [apiTParam]);

  useEffect(() => {
    refreshAll();
    setLoading(false);
  }, [refreshAll, refreshKey]);

  // Countdown for scheduled start
  useEffect(() => {
    if (!scheduledStart) { setCountdown(''); return; }
    const tick = () => {
      const diff = scheduledStart - Date.now();
      if (diff <= 0) { setCountdown('Any moment now…'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(
        h > 0
          ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
          : `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [scheduledStart]);

  useSocketEvent('auction:state', useCallback(({ active, recentBids, auctionStatus, scheduledStart: ss, completionSummary }) => {
    if (isViewingHistory) return;
    if (active !== undefined) setActive(active);
    if (recentBids) setRecentBids(recentBids);
    if (auctionStatus) setAuctionStatus(auctionStatus);
    if (completionSummary !== undefined) {
      setCompletionSummary(completionSummary || '');
      if (completionSummary) setCompletionSummaryLoading(false);
    }
    setScheduledStart(ss || null);
  }, [isViewingHistory]));

  useSocketEvent('auction:scheduled_start', useCallback(({ ts }) => {
    if (!isViewingHistory) setScheduledStart(ts || null);
  }, [isViewingHistory]));

  useSocketEvent('auction:status', useCallback(({ status }) => {
    if (!isViewingHistory) setAuctionStatus(status);
  }, [isViewingHistory]));

  useSocketEvent('auction:started', useCallback(() => {
    if (isViewingHistory) return;
    refreshAll();
    setBidInput('');
    setBidError('');
    setSoldMessage(null);
    setCompletionSummaryLoading(false);
  }, [refreshAll, isViewingHistory]));

  useSocketEvent('auction:update', useCallback(({ currentPrice, leaderId, leaderName, leaderColor, endTime, recentBids }) => {
    if (isViewingHistory) return;
    setActive((prev) => prev ? {
      ...prev,
      current_price: currentPrice,
      current_leader_id: leaderId,
      leader_name: leaderName,
      leader_color: leaderColor,
      bid_end_time: endTime,
    } : prev);
    if (recentBids) setRecentBids(recentBids);
    setBidInput('');
    setBidError('');
  }, [isViewingHistory]));

  useSocketEvent('auction:sold', useCallback(({ teamName, winnerName, winnerColor, finalPrice, aiCommentaryEnabled }) => {
    if (isViewingHistory) return;
    setSoldMessage({
      teamName,
      winnerName,
      winnerColor,
      finalPrice,
      commentary: '',
      commentaryLoading: !!aiCommentaryEnabled,
    });
    setActive(null);
    setRecentBids([]);
    refreshItems();
  }, [refreshItems, isViewingHistory]));

  useSocketEvent('auction:commentary:chunk', useCallback(({ token }) => {
    if (isViewingHistory) return;
    setSoldMessage((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        commentary: `${prev.commentary || ''}${token || ''}`,
        commentaryLoading: true,
      };
    });
  }, [isViewingHistory]));

  useSocketEvent('auction:commentary:done', useCallback(() => {
    if (isViewingHistory) return;
    setSoldMessage((prev) => (prev ? { ...prev, commentaryLoading: false } : prev));
  }, [isViewingHistory]));

  useSocketEvent('auction:nobids', useCallback(() => {
    if (isViewingHistory) return;
    setActive(null);
    setRecentBids([]);
    refreshItems();
  }, [refreshItems, isViewingHistory]));

  useSocketEvent('auction:complete', useCallback(() => {
    if (!isViewingHistory) { setAuctionStatus('complete'); setActive(null); }
  }, [isViewingHistory]));

  useSocketEvent('auction:summary:started', useCallback(() => {
    if (!isViewingHistory) setCompletionSummaryLoading(true);
  }, [isViewingHistory]));

  useSocketEvent('auction:summary:done', useCallback(({ text }) => {
    if (isViewingHistory) return;
    setCompletionSummary(text || '');
    setCompletionSummaryLoading(false);
  }, [isViewingHistory]));

  useSocketEvent('auction:error', useCallback(({ message }) => {
    if (!isViewingHistory) setBidError(message);
  }, [isViewingHistory]));

  const placeBid = () => {
    const amount = parseFloat(bidInput);
    if (isNaN(amount) || amount <= 0) { setBidError('Enter a valid bid amount'); return; }
    if (!active) { setBidError('No active auction'); return; }
    if (amount <= active.current_price) {
      setBidError(`Bid must be greater than ${fmt(active.current_price)}`);
      return;
    }
    socket?.emit('auction:bid', { amount });
    setBidInput('');
  };

  const quickBid = () => {
    if (!active) return;
    const next = active.current_price > 0 ? active.current_price + 5 : 5;
    socket?.emit('auction:bid', { amount: next });
  };

  const soldCount = items.filter((i) => i.status === 'sold').length;
  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const isLeader = active?.current_leader_id === participant?.id;
  const recapLines = (completionSummary || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const recapBullets = recapLines.filter((line) => line.startsWith('- '));
  const recapIntro = recapLines
    .filter((line) => !line.startsWith('- '))
    .join(' ');

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8" role="status" aria-label="Loading auction">
        <div className="space-y-4 animate-fade-in">
          <div className="skeleton h-10 w-48" />
          <div className="skeleton h-48 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">

      {/* ── Status bar ── */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-text-primary">Live Auction</h1>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className="badge badge-neutral tabular-nums">
            <span aria-hidden="true">✅</span>
            {soldCount} sold
          </span>
          <span className="badge badge-neutral tabular-nums">
            <span aria-hidden="true">⏳</span>
            {pendingCount} remaining
          </span>
          {STATUS_BADGE[auctionStatus] ?? STATUS_BADGE.waiting}
        </div>
      </div>

      {/* ── Sale flash ── */}
      {soldMessage && (
        <div className="mb-6 bg-status-success/10 border border-status-success/30 rounded-2xl p-5 text-center animate-slide-up" role="status">
          <div className="text-2xl mb-1" aria-hidden="true">🎉</div>
          <div className="text-status-success font-bold text-lg">{soldMessage.teamName} sold!</div>
          <div className="text-text-secondary text-sm mt-1">
            Won by{' '}
            <span className="font-semibold" style={{ color: soldMessage.winnerColor }}>{soldMessage.winnerName}</span>
            {' '}for <span className="font-bold text-text-primary tabular-nums">{fmt(soldMessage.finalPrice)}</span>
          </div>
          {soldMessage.commentary && (
            <div className="mt-3 max-w-2xl mx-auto text-sm text-text-primary leading-relaxed">
              {soldMessage.commentary}
            </div>
          )}
          {soldMessage.commentaryLoading && (
            <div className="mt-3 inline-flex items-center gap-2 text-xs text-text-secondary">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-text-muted border-t-brand animate-spin" aria-hidden="true" />
              <span>Generating AI commentary…</span>
            </div>
          )}
        </div>
      )}

      {/* ── Active auction ── */}
      {active ? (
        <div className="mb-6 space-y-4">
          <div className="section-label">Now Bidding</div>
          <ActiveTeamCard item={active} />

          {/* Bid + leader */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-4 text-center">
              <div className="section-label mb-1">Current Bid</div>
              <div className="text-3xl font-bold text-brand tabular-nums">
                {active.current_price > 0 ? fmt(active.current_price) : '—'}
              </div>
            </div>
            <div className="card p-4 text-center">
              <div className="section-label mb-1">Leader</div>
              {active.leader_name ? (
                <div className="flex items-center justify-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: active.leader_color }}
                    aria-hidden="true"
                  />
                  <span className={`font-bold text-sm ${isLeader ? 'text-status-success' : 'text-text-primary'}`}>
                    {isLeader ? 'You!' : active.leader_name}
                  </span>
                </div>
              ) : (
                <div className="text-text-secondary font-medium text-sm">No bids</div>
              )}
            </div>
          </div>

          {/* Timer */}
          <div className="card py-4">
            <div className="section-label text-center mb-2">Time Remaining</div>
            <CountdownTimer endTime={active.bid_end_time} />
          </div>

          {/* Bid controls */}
          {!isViewingHistory && auctionStatus !== 'paused' ? (
            <div className="space-y-3">
              {isLeader ? (
                <div className="card p-4 text-center bg-status-success/10 ring-1 ring-status-success/30">
                  <span className="text-status-success font-semibold">🏆 You have the high bid!</span>
                </div>
              ) : (
                <>
                  <button
                    onClick={quickBid}
                    className="btn-primary btn-lg w-full"
                  >
                    Quick Bid {active.current_price > 0 ? fmt(active.current_price + 5) : fmt(5)}
                  </button>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm" aria-hidden="true">$</span>
                      <input
                        type="number"
                        value={bidInput}
                        onChange={(e) => { setBidInput(e.target.value); setBidError(''); }}
                        onKeyDown={(e) => e.key === 'Enter' && placeBid()}
                        placeholder={`${active.current_price > 0 ? Math.ceil(active.current_price) + 1 : 1}+`}
                        min={active.current_price + 1}
                        step="1"
                        aria-label="Custom bid amount"
                        className="input pl-7"
                      />
                    </div>
                    <button onClick={placeBid} className="btn-secondary px-5">
                      Bid
                    </button>
                  </div>
                </>
              )}
              {bidError && (
                <div role="alert" className="badge badge-error w-full justify-center py-2 rounded-xl text-sm">
                  {bidError}
                </div>
              )}
            </div>
          ) : !isViewingHistory ? (
            <div className="card p-4 text-center bg-status-warning/10 ring-1 ring-status-warning/30">
              <span className="text-status-warning font-medium">Auction paused — wait for admin</span>
            </div>
          ) : null}

          {/* Bid feed */}
          <div>
            <div className="section-label mb-3">Recent Bids</div>
            <BidFeed bids={recentBids} />
          </div>
        </div>

      ) : auctionStatus === 'complete' ? (
        <div className="card p-10 text-center mb-6">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}>
            <span aria-hidden="true" className="text-3xl leading-none">🏆</span>
          </div>
          <h2 className="text-2xl font-bold text-text-primary mb-2">Auction Complete!</h2>
          <p className="text-text-secondary">
            All teams have been sold. Check Standings{participant?.isAdmin ? '.' : ' and My Teams.'}
          </p>
          {(completionSummaryLoading || completionSummary) && (
            <div className="mt-6 text-left max-w-3xl mx-auto bg-surface-base/50 border border-surface-border rounded-xl p-4">
              <div className="section-label mb-2">AI Auction Recap</div>
              {completionSummaryLoading && !completionSummary && (
                <div className="inline-flex items-center gap-2 text-xs text-text-secondary">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-text-muted border-t-brand animate-spin" aria-hidden="true" />
                  <span>Generating final recap…</span>
                </div>
              )}
              {completionSummary && (
                <div className="space-y-3">
                  {recapIntro && (
                    <p className="text-sm text-text-secondary leading-relaxed">{recapIntro}</p>
                  )}
                  {recapBullets.length > 0 ? (
                    <div className="space-y-2">
                      {recapBullets.map((line, idx) => (
                        <div
                          key={`${line}-${idx}`}
                          className="text-sm text-text-primary bg-surface-raised/60 border border-surface-border rounded-lg px-3 py-2"
                          style={{ borderLeftWidth: '3px', borderLeftColor: 'rgba(249, 115, 22, 0.65)' }}
                        >
                          {line.slice(2)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
                      {completionSummary}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

      ) : auctionStatus === 'waiting' ? (
        <div className="card p-10 text-center mb-6">
          <div className="text-5xl mb-4" aria-hidden="true">{scheduledStart ? '🕐' : '⏳'}</div>
          <h2 className="text-xl font-bold text-text-primary mb-2">Waiting for Auction to Start</h2>
          {scheduledStart && countdown ? (
            <>
              <p className="text-text-secondary mb-3">Auction opens in</p>
              <div
                className="text-3xl font-mono font-bold text-brand tabular-nums"
                role="timer"
                aria-live="off"
                aria-label={`Auction opens in ${countdown}`}
              >
                {countdown}
              </div>
              <p className="text-text-secondary text-xs mt-3">
                {new Date(scheduledStart).toLocaleString()}
              </p>
            </>
          ) : (
            <p className="text-text-secondary">The admin will start the auction shortly. Stay tuned!</p>
          )}
        </div>

      ) : (
        <div className="card p-10 text-center mb-6">
          <div className="text-5xl mb-4" aria-hidden="true">⏸</div>
          <h2 className="text-xl font-bold text-text-primary mb-2">Auction Paused</h2>
          <p className="text-text-secondary">Waiting for admin to start the next team.</p>
        </div>
      )}

      <SoldByOwner items={items} participantId={participant?.id} />
    </div>
  );
}
