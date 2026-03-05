import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CountdownTimer from '../components/CountdownTimer';
import DriverIdentity from '../components/DriverIdentity';
import ParticipantAvatar from '../components/ParticipantAvatar';
import TeamLogo from '../components/TeamLogo';
import { useAuth } from '../context/AuthContext';
import { useSocket, useSocketEvent } from '../context/SocketContext';
import { api, fmtCents } from '../utils';
import { getTeamColorStyle } from '../teamMeta';

function ActiveDriverCard({ active, recentBids }) {
  if (!active) return null;

  return (
    <section className="panel live-panel pulse-live">
      <div className="live-header">
        <span className="status-led" />
        <span>Live Auction</span>
      </div>
      <div className="driver-id-row">
        <TeamLogo
          teamName={active.team_name}
          driverCode={active.driver_code}
          size={34}
          className="live-driver-logo"
          critical
        />
        <span className="driver-code">{active.driver_code}</span>
        <span
          className="team-chip team-accent-text"
          style={getTeamColorStyle({ teamName: active.team_name, driverCode: active.driver_code })}
        >
          {active.team_name}
        </span>
      </div>
      <h2
        className="driver-name team-accent-text"
        style={getTeamColorStyle({ teamName: active.team_name, driverCode: active.driver_code })}
      >
        {active.driver_name}
      </h2>
      <div className="live-grid">
        <div>
          <div className="label">Current Price</div>
          <div className="value value-accent">{fmtCents(active.current_price_cents)}</div>
        </div>
        <div>
          <div className="label">Bid Clock</div>
          <CountdownTimer endTime={active.bid_end_time} />
        </div>
      </div>
      {active.leader_name ? (
        <div className="leader-row">
          <ParticipantAvatar name={active.leader_name} color={active.leader_color} />
          <span>{active.leader_name} leads</span>
        </div>
      ) : (
        <div className="leader-row muted">No bids yet</div>
      )}

      <div className="live-bid-feed">
        <div className="live-bid-feed-head">Bid Activity</div>
        {!recentBids.length ? (
          <p className="muted small">Bids will appear here as they come in.</p>
        ) : (
          <ul className="list tight live-bid-list">
            {recentBids.map((bid) => (
              <li key={bid.id}>
                <div className="row gap-sm">
                  <ParticipantAvatar name={bid.participant_name} color={bid.color} />
                  <span>{bid.participant_name}</span>
                </div>
                <strong>{fmtCents(bid.amount_cents)}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function SoldDriverRow({ driver, mine = false }) {
  return (
    <li className={`sold-driver-row ${mine ? 'mine' : ''}`}>
      <div className="sold-driver-main">
        <DriverIdentity
          driverName={driver.driver_name}
          driverCode={driver.driver_code}
          teamName={driver.team_name}
          compact
          className="sold-driver-identity"
        />
      </div>
      <strong className="sold-driver-price">{fmtCents(driver.final_price_cents)}</strong>
    </li>
  );
}

export default function Auction() {
  const { participant } = useAuth();
  const { socket } = useSocket();
  const canPlaceBid = !!participant && !participant.isAdmin;

  const [auctionStatus, setAuctionStatus] = useState('waiting');
  const [active, setActive] = useState(null);
  const [items, setItems] = useState([]);
  const [recentBids, setRecentBids] = useState([]);
  const [bidInput, setBidInput] = useState('');
  const [bidError, setBidError] = useState('');
  const [soldNotice, setSoldNotice] = useState(null);

  const refresh = useCallback(async () => {
    const response = await api('/auction');
    const data = await response.json();
    setAuctionStatus(data.auctionStatus);
    setActive(data.active);
    setItems(data.items || []);
    setRecentBids(data.recentBids || []);
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  useEffect(() => {
    if (!socket) return undefined;
    const onConnect = () => {
      refresh().catch(() => {});
    };
    socket.on('connect', onConnect);
    return () => socket.off('connect', onConnect);
  }, [socket, refresh]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      refresh().catch(() => {});
    }, 15000);
    return () => clearInterval(intervalId);
  }, [refresh]);

  useSocketEvent('auction:state', useCallback((payload) => {
    setAuctionStatus(payload.auctionStatus || 'waiting');
    setActive(payload.active || null);
    setItems(payload.items || []);
    setRecentBids(payload.recentBids || []);
  }, []));

  useSocketEvent('auction:started', useCallback(() => {
    setSoldNotice(null);
    refresh().catch(() => {});
  }, [refresh]));

  useSocketEvent('auction:update', useCallback((payload) => {
    setActive((prev) => (prev ? {
      ...prev,
      current_price_cents: payload.currentPriceCents,
      current_leader_id: payload.leaderId,
      leader_name: payload.leaderName,
      leader_color: payload.leaderColor,
      bid_end_time: payload.endTime,
    } : prev));
    setRecentBids(payload.recentBids || []);
    setBidError('');
    setBidInput('');
  }, []));

  useSocketEvent('auction:sold', useCallback((payload) => {
    setSoldNotice({
      kind: 'sold',
      driverName: payload.driverName || payload.driverCode || 'Driver',
      driverCode: payload.driverCode || '',
      teamName: payload.teamName || '',
      winnerName: payload.winnerName || 'Unknown',
      finalPriceCents: payload.finalPriceCents || 0,
    });
    setActive(null);
    setRecentBids([]);
    setItems((prev) => prev.map((item) => (
      item.id === payload.itemId
        ? {
            ...item,
            status: 'sold',
            winner_id: payload.winnerId,
            winner_name: payload.winnerName,
            winner_color: payload.winnerColor,
            final_price_cents: payload.finalPriceCents,
            current_leader_id: payload.winnerId,
            current_price_cents: payload.finalPriceCents,
            bid_end_time: null,
          }
        : item
    )));
    refresh().catch(() => {});
  }, [refresh]));

  useSocketEvent('auction:nobids', useCallback((payload) => {
    setSoldNotice({ kind: 'nobids', message: 'No bids. Driver returned to queue.' });
    setActive(null);
    setRecentBids([]);
    setItems((prev) => prev.map((item) => (
      item.id === payload.itemId
        ? {
            ...item,
            status: 'pending',
            current_price_cents: 0,
            current_leader_id: null,
            final_price_cents: null,
            winner_id: null,
            winner_name: null,
            winner_color: null,
            bid_end_time: null,
          }
        : item
    )));
    refresh().catch(() => {});
  }, [refresh]));

  useSocketEvent('auction:status', useCallback(({ status }) => {
    setAuctionStatus(status);
  }, []));

  useSocketEvent('auction:error', useCallback(({ error }) => {
    setBidError(error || 'Bid failed');
  }, []));

  const pendingCount = useMemo(
    () => items.filter((item) => item.status === 'pending').length,
    [items],
  );

  const soldByOwner = useMemo(() => {
    const sold = items.filter((item) => item.status === 'sold');
    const map = new Map();
    sold.forEach((item) => {
      const key = item.winner_id;
      if (!map.has(key)) {
        map.set(key, {
          ownerId: key,
          ownerName: item.winner_name,
          ownerColor: item.winner_color,
          totalCents: 0,
          drivers: [],
        });
      }
      const group = map.get(key);
      group.totalCents += item.final_price_cents || 0;
      group.drivers.push(item);
    });
    return [...map.values()]
      .map((owner) => ({
        ...owner,
        drivers: [...owner.drivers].sort((a, b) => (b.final_price_cents || 0) - (a.final_price_cents || 0)),
      }))
      .sort((a, b) => b.totalCents - a.totalCents);
  }, [items]);

  const myOwnerId = participant?.id || null;
  const mySoldGroup = useMemo(
    () => soldByOwner.find((owner) => owner.ownerId === myOwnerId) || null,
    [soldByOwner, myOwnerId]
  );
  const otherSoldGroups = useMemo(
    () => soldByOwner.filter((owner) => owner.ownerId !== myOwnerId),
    [soldByOwner, myOwnerId]
  );
  const soldCount = useMemo(
    () => soldByOwner.reduce((sum, owner) => sum + owner.drivers.length, 0),
    [soldByOwner]
  );
  const auctionPurseCents = useMemo(
    () => soldByOwner.reduce((sum, owner) => sum + owner.totalCents, 0),
    [soldByOwner]
  );
  const auctionComplete = auctionStatus === 'complete';

  const submitBid = (event) => {
    event.preventDefault();
    setBidError('');
    if (!canPlaceBid) {
      setBidError('Admin accounts cannot place bids.');
      return;
    }
    const value = Math.round(Number(bidInput) * 100);
    if (!Number.isFinite(value) || value <= 0) {
      setBidError('Enter a valid bid amount.');
      return;
    }
    socket?.emit('auction:bid', { amountCents: value });
  };

  const quickBidCents = (active?.current_price_cents || 0) + 100;

  const submitQuickBid = () => {
    setBidError('');
    if (!canPlaceBid) {
      setBidError('Admin accounts cannot place bids.');
      return;
    }
    if (!active) return;
    socket?.emit('auction:bid', { amountCents: quickBidCents });
  };

  return (
    <div className="stack-lg">
      <section className="panel telemetry-strip stagger-in">
        <div className="strip-item">
          <span className="label">Status</span>
          <strong className={`status-text status-${auctionStatus}`}>{auctionStatus}</strong>
        </div>
        <div className="strip-item">
          <span className="label">Pending Drivers</span>
          <strong>{pendingCount}</strong>
        </div>
        <div className="strip-item">
          <span className="label">Auction Purse</span>
          <strong>{fmtCents(auctionPurseCents)}</strong>
        </div>
      </section>

      {active ? <ActiveDriverCard active={active} recentBids={recentBids} /> : (
        <section className="panel">
          {auctionComplete ? (
            <>
              <h2>Auction Complete</h2>
              <p className="muted">All drivers are sold. Final purse: {fmtCents(auctionPurseCents)} across {soldCount} drivers.</p>
            </>
          ) : (
            <>
              <h2>No live driver currently</h2>
              <p className="muted">Admin can open the next driver when ready.</p>
            </>
          )}
        </section>
      )}

      {active ? (
        <section className="panel">
          <h3>Place Bid</h3>
          {canPlaceBid ? (
            <form className="bid-form" onSubmit={submitBid}>
              <div className="currency-prefix">$</div>
              <input
                value={bidInput}
                onChange={(e) => setBidInput(e.target.value)}
                placeholder="0"
                inputMode="decimal"
              />
              <button
                className="btn btn-outline quick-bid-btn"
                type="button"
                onClick={submitQuickBid}
              >
                Quick +$1
              </button>
              <button className="btn" type="submit">Bid</button>
            </form>
          ) : (
            <p className="muted">Admin view only. Bidding is disabled for admin accounts.</p>
          )}
          {bidError ? <p className="error-text">{bidError}</p> : null}
        </section>
      ) : null}

      {auctionComplete ? (
        <section className="panel note-panel">Auction complete. All drivers have been sold.</section>
      ) : soldNotice ? (
        <section className="panel note-panel">
          {soldNotice.kind === 'sold' ? (
            <>
              <span
                className="team-accent-text"
                style={getTeamColorStyle({ teamName: soldNotice.teamName, driverCode: soldNotice.driverCode })}
              >
                {soldNotice.driverName}
              </span>
              {' sold to '}
              <span>{soldNotice.winnerName}</span>
              {' for '}
              <strong>{fmtCents(soldNotice.finalPriceCents)}</strong>
            </>
          ) : soldNotice.message}
        </section>
      ) : null}

      <section className="panel sold-showcase">
        <div className="row between wrap gap-sm">
          <h2>Sold Drivers</h2>
          <div className="row wrap gap-sm">
            <span className="sold-kpi">{soldCount} sold</span>
            <span className="sold-kpi mine">My spend {fmtCents(mySoldGroup?.totalCents || 0)}</span>
          </div>
        </div>

        {!soldByOwner.length ? <p className="muted">No sales yet.</p> : (
          <div className="sold-lanes">
            <section className="sold-lane mine">
              <div className="sold-lane-head">
                <h3>Your Garage</h3>
                <span>{mySoldGroup?.drivers.length || 0} drivers</span>
              </div>
              {mySoldGroup?.drivers?.length ? (
                <ul className="sold-driver-list mine">
                  {mySoldGroup.drivers.map((driver) => (
                    <SoldDriverRow key={driver.id} driver={driver} mine />
                  ))}
                </ul>
              ) : (
                <p className="muted small">You have not won a driver yet.</p>
              )}
            </section>

            <section className="sold-lane">
              <div className="sold-lane-head">
                <h3>Other Participants</h3>
                <span>{otherSoldGroups.length} owners</span>
              </div>
              {!otherSoldGroups.length ? <p className="muted small">No other owners yet.</p> : (
                <div className="stack">
                  {otherSoldGroups.map((owner) => (
                    <article key={owner.ownerId} className="owner-card sold-owner-block">
                      <div className="row between">
                        <div className="row gap-sm">
                          <ParticipantAvatar name={owner.ownerName} color={owner.ownerColor} />
                          <strong>{owner.ownerName}</strong>
                        </div>
                        <strong>{fmtCents(owner.totalCents)}</strong>
                      </div>
                      <ul className="sold-driver-list">
                        {owner.drivers.map((driver) => (
                          <SoldDriverRow key={driver.id} driver={driver} />
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
