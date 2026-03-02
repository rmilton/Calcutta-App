import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket, useSocketEvent } from '../context/SocketContext';
import { useTournament } from '../context/TournamentContext';
import CountdownTimer from '../components/CountdownTimer';
import TeamLogo from '../components/TeamLogo';
import { fmt } from '../utils';

const REGION_COLORS = {
  East: '#ef4444',
  West: '#3b82f6',
  South: '#22c55e',
  Midwest: '#f59e0b',
};

function TeamCard({ item }) {
  const color = REGION_COLORS[item?.region] || '#6366f1';
  return (
    <div className="rounded-xl border-2 p-6 text-center" style={{ borderColor: color }}>
      <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color }}>
        {item?.region} Region · #{item?.seed} seed
      </div>
      <div className="flex items-center justify-center gap-4">
        <TeamLogo
          espnId={item?.team_espn_id}
          teamColor={item?.team_color}
          name={item?.team_name}
          seed={item?.seed}
          size={56}
        />
        <span className="text-2xl font-bold text-white">{item?.team_name}</span>
      </div>
    </div>
  );
}

function SoldByOwner({ items, participantId }) {
  const sold = items.filter((i) => i.status === 'sold');
  if (!sold.length) return null;

  // Total pot
  const totalPot = sold.reduce((s, i) => s + (i.final_price || 0), 0);

  // Group by winner
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

  // Sort: current user first, then by spend desc
  const groups = Object.values(byOwner).sort((a, b) => {
    if (a.id === participantId) return -1;
    if (b.id === participantId) return 1;
    return b.spent - a.spent;
  });

  const mySpent = byOwner[participantId]?.spent ?? 0;

  return (
    <div className="space-y-4">
      {/* Pot summary bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Sold Teams
        </h2>
        <div className="flex items-center gap-4 text-sm">
          {participantId && byOwner[participantId] && (
            <span className="text-slate-400">
              Your spend:{' '}
              <span className="font-bold text-white">{fmt(mySpent)}</span>
            </span>
          )}
          <span className="text-slate-400">
            Total pot:{' '}
            <span className="font-bold text-green-400">{fmt(totalPot)}</span>
          </span>
        </div>
      </div>

      {/* One card per owner */}
      {groups.map((group) => {
        const isMe = group.id === participantId;
        return (
          <div
            key={group.id}
            className={`rounded-xl border overflow-hidden ${isMe ? 'border-orange-500/60' : 'border-slate-700'}`}
          >
            {/* Owner header */}
            <div
              className={`flex items-center justify-between px-4 py-2.5 ${isMe ? 'bg-slate-700/80' : 'bg-slate-800'}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: group.color }}
                >
                  {group.name?.[0]?.toUpperCase()}
                </span>
                <span className={`font-semibold text-sm ${isMe ? 'text-orange-400' : 'text-white'}`}>
                  {isMe ? `${group.name} (You)` : group.name}
                </span>
                <span className="text-slate-500 text-xs">· {group.teams.length} team{group.teams.length !== 1 ? 's' : ''}</span>
              </div>
              <span className="text-sm font-bold text-white">{fmt(group.spent)}</span>
            </div>

            {/* Team rows */}
            <div className="bg-slate-800/50 divide-y divide-slate-700/50">
              {group.teams.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-2">
                  <TeamLogo
                    espnId={item.team_espn_id}
                    teamColor={item.team_color}
                    name={item.team_name}
                    seed={item.seed}
                    size={20}
                  />
                  <span className="text-sm text-slate-200 flex-1 truncate">{item.team_name}</span>
                  <span className="text-xs text-slate-500 shrink-0">{item.region}</span>
                  <span className="text-sm font-semibold text-white shrink-0">{fmt(item.final_price)}</span>
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
  if (!bids?.length) return <p className="text-slate-500 text-sm text-center py-4">No bids yet — be the first!</p>;
  return (
    <div className="space-y-1.5 max-h-48 overflow-y-auto">
      {bids.map((bid, i) => (
        <div key={bid.id || i} className="flex items-center justify-between bg-slate-800 rounded px-3 py-2">
          <div className="flex items-center gap-2">
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: bid.color }}
            >
              {bid.participant_name?.[0]?.toUpperCase()}
            </span>
            <span className="text-slate-200 text-sm">{bid.participant_name}</span>
          </div>
          <span className="font-bold text-green-400 text-sm">{fmt(bid.amount)}</span>
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
  const [scheduledStart, setScheduledStart] = useState(null); // Unix ms
  const [countdown, setCountdown] = useState('');

  const refreshItems = useCallback(() => {
    fetch(`/api/auction/items${apiTParam || ''}`, { credentials: 'include' })
      .then((r) => r.json())
      .then(setItems);
  }, [apiTParam]);

  const refreshAll = useCallback(() => {
    fetch(`/api/auction${apiTParam || ''}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        setAuctionStatus(data.auctionStatus);
        setActive(data.active);
        setRecentBids(data.recentBids || []);
        setItems(data.items || []);
      });
  }, [apiTParam]);

  // Initial load + reload on tournament switch or history navigation
  useEffect(() => {
    refreshAll();
    setLoading(false);
  }, [refreshAll, refreshKey]);

  // Countdown effect for scheduled start
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

  // Live socket events — skip when viewing archived tournament
  useSocketEvent('auction:state', useCallback(({ active, recentBids, auctionStatus, scheduledStart: ss }) => {
    if (isViewingHistory) return;
    if (active !== undefined) setActive(active);
    if (recentBids) setRecentBids(recentBids);
    if (auctionStatus) setAuctionStatus(auctionStatus);
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

  useSocketEvent('auction:sold', useCallback(({ teamName, winnerName, winnerColor, finalPrice }) => {
    if (isViewingHistory) return;
    setSoldMessage({ teamName, winnerName, winnerColor, finalPrice });
    setActive(null);
    setRecentBids([]);
    refreshItems();
    setTimeout(() => setSoldMessage(null), 6000);
  }, [refreshItems, isViewingHistory]));

  useSocketEvent('auction:nobids', useCallback(() => {
    if (isViewingHistory) return;
    setActive(null);
    setRecentBids([]);
    refreshItems();
  }, [refreshItems, isViewingHistory]));

  useSocketEvent('auction:complete', useCallback(() => {
    if (!isViewingHistory) { setAuctionStatus('complete'); setActive(null); }
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

  if (loading) return <div className="flex items-center justify-center min-h-[60vh] text-slate-400">Loading...</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Status bar */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">Live Auction</h1>
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span>✅ {soldCount} sold</span>
          <span>⏳ {pendingCount} remaining</span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            auctionStatus === 'open' ? 'bg-green-900 text-green-300' :
            auctionStatus === 'paused' ? 'bg-yellow-900 text-yellow-300' :
            auctionStatus === 'complete' ? 'bg-blue-900 text-blue-300' :
            'bg-slate-700 text-slate-300'
          }`}>
            {auctionStatus === 'open' ? 'LIVE' : auctionStatus === 'paused' ? 'PAUSED' : auctionStatus === 'complete' ? 'COMPLETE' : 'WAITING'}
          </span>
        </div>
      </div>

      {/* Sold flash */}
      {soldMessage && (
        <div className="mb-6 bg-green-900 border border-green-600 rounded-xl p-5 text-center">
          <div className="text-2xl mb-1">🎉</div>
          <div className="text-green-300 font-bold text-lg">{soldMessage.teamName} sold!</div>
          <div className="text-green-400 text-sm mt-1">
            Won by <span className="font-semibold" style={{ color: soldMessage.winnerColor }}>{soldMessage.winnerName}</span> for{' '}
            <span className="font-bold text-white">{fmt(soldMessage.finalPrice)}</span>
          </div>
        </div>
      )}

      {/* Active auction */}
      {active ? (
        <div className="bg-slate-800 rounded-2xl p-6 mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">Now Bidding</p>
          <TeamCard item={active} />

          <div className="mt-6 grid grid-cols-2 gap-4 text-center">
            <div className="bg-slate-700 rounded-xl p-4">
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Current Bid</div>
              <div className="text-3xl font-bold text-white">
                {active.current_price > 0 ? fmt(active.current_price) : '—'}
              </div>
            </div>
            <div className="bg-slate-700 rounded-xl p-4">
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Leader</div>
              {active.leader_name ? (
                <div className="flex items-center justify-center gap-2">
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: active.leader_color }}
                  >
                    {active.leader_name[0].toUpperCase()}
                  </span>
                  <span className={`font-bold ${isLeader ? 'text-green-400' : 'text-white'}`}>
                    {isLeader ? 'You!' : active.leader_name}
                  </span>
                </div>
              ) : (
                <div className="text-slate-500 font-medium">No bids</div>
              )}
            </div>
          </div>

          <div className="mt-4 py-4">
            <div className="text-xs text-slate-400 text-center uppercase tracking-wider mb-2">Time Remaining</div>
            <CountdownTimer endTime={active.bid_end_time} />
          </div>

          {!isViewingHistory && auctionStatus !== 'paused' ? (
            <div className="mt-6 space-y-3">
              {isLeader ? (
                <div className="text-center py-3 bg-green-900/40 rounded-lg border border-green-700">
                  <span className="text-green-400 font-semibold">You have the high bid!</span>
                </div>
              ) : (
                <>
                  <button
                    onClick={quickBid}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-lg transition-colors text-lg"
                  >
                    Quick Bid {active.current_price > 0 ? fmt(active.current_price + 5) : fmt(5)}
                  </button>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                      <input
                        type="number"
                        value={bidInput}
                        onChange={(e) => { setBidInput(e.target.value); setBidError(''); }}
                        onKeyDown={(e) => e.key === 'Enter' && placeBid()}
                        placeholder={`${active.current_price > 0 ? Math.ceil(active.current_price) + 1 : 1}+`}
                        min={active.current_price + 1}
                        step="1"
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-7 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <button
                      onClick={placeBid}
                      className="bg-slate-600 hover:bg-slate-500 text-white font-bold px-5 rounded-lg transition-colors"
                    >
                      Bid
                    </button>
                  </div>
                </>
              )}
              {bidError && <p className="text-red-400 text-sm text-center">{bidError}</p>}
            </div>
          ) : !isViewingHistory ? (
            <div className="mt-4 text-center text-yellow-400 font-medium py-3 bg-yellow-900/30 rounded-lg border border-yellow-700">
              Auction paused — wait for admin
            </div>
          ) : null}

          <div className="mt-6">
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-3">Recent Bids</div>
            <BidFeed bids={recentBids} />
          </div>
        </div>
      ) : auctionStatus === 'complete' ? (
        <div className="bg-slate-800 rounded-2xl p-10 text-center mb-6">
          <div className="text-5xl mb-4">🏆</div>
          <h2 className="text-2xl font-bold text-white mb-2">Auction Complete!</h2>
          <p className="text-slate-400">All teams have been sold. Check Standings and My Teams.</p>
        </div>
      ) : auctionStatus === 'waiting' ? (
        <div className="bg-slate-800 rounded-2xl p-10 text-center mb-6">
          <div className="text-5xl mb-4">{scheduledStart ? '🕐' : '⏳'}</div>
          <h2 className="text-xl font-bold text-white mb-2">Waiting for Auction to Start</h2>
          {scheduledStart && countdown ? (
            <>
              <p className="text-slate-400 mb-3">Auction opens in</p>
              <div className="text-3xl font-mono font-bold text-orange-400 tabular-nums">{countdown}</div>
              <p className="text-slate-500 text-xs mt-3">
                {new Date(scheduledStart).toLocaleString()}
              </p>
            </>
          ) : (
            <p className="text-slate-400">The admin will start the auction shortly. Stay tuned!</p>
          )}
        </div>
      ) : (
        <div className="bg-slate-800 rounded-2xl p-10 text-center mb-6">
          <div className="text-5xl mb-4">⏸</div>
          <h2 className="text-xl font-bold text-white mb-2">Auction Paused</h2>
          <p className="text-slate-400">Waiting for admin to start the next team.</p>
        </div>
      )}

      <SoldByOwner items={items} participantId={participant?.id} />
    </div>
  );
}
