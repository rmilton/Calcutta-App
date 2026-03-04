import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CountdownTimer from '../components/CountdownTimer';
import ParticipantAvatar from '../components/ParticipantAvatar';
import { useAuth } from '../context/AuthContext';
import { useSocket, useSocketEvent } from '../context/SocketContext';
import { api, fmtCents } from '../utils';

function ActiveDriverCard({ active }) {
  if (!active) return null;

  return (
    <section className="panel live-panel pulse-live">
      <div className="live-header">
        <span className="status-led" />
        <span>Live Auction</span>
      </div>
      <div className="driver-id-row">
        <span className="driver-code">{active.driver_code}</span>
        <span className="team-chip">{active.team_name}</span>
      </div>
      <h2 className="driver-name">{active.driver_name}</h2>
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
    </section>
  );
}

export default function Auction() {
  const { participant } = useAuth();
  const { socket } = useSocket();

  const [auctionStatus, setAuctionStatus] = useState('waiting');
  const [active, setActive] = useState(null);
  const [items, setItems] = useState([]);
  const [recentBids, setRecentBids] = useState([]);
  const [bidInput, setBidInput] = useState('');
  const [bidError, setBidError] = useState('');
  const [soldMessage, setSoldMessage] = useState('');

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

  useSocketEvent('auction:state', useCallback((payload) => {
    setAuctionStatus(payload.auctionStatus || 'waiting');
    setActive(payload.active || null);
    setItems(payload.items || []);
    setRecentBids(payload.recentBids || []);
  }, []));

  useSocketEvent('auction:started', useCallback(() => {
    setSoldMessage('');
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
    setSoldMessage(`${payload.driverCode} sold to ${payload.winnerName} for ${fmtCents(payload.finalPriceCents)}`);
    refresh().catch(() => {});
  }, [refresh]));

  useSocketEvent('auction:nobids', useCallback(() => {
    setSoldMessage('No bids. Driver returned to queue.');
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
    return [...map.values()].sort((a, b) => b.totalCents - a.totalCents);
  }, [items]);

  const submitBid = (event) => {
    event.preventDefault();
    setBidError('');
    const value = Math.round(Number(bidInput) * 100);
    if (!Number.isFinite(value) || value <= 0) {
      setBidError('Enter a valid bid amount.');
      return;
    }
    socket?.emit('auction:bid', { amountCents: value });
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
          <span className="label">You</span>
          <strong>{participant?.name}</strong>
        </div>
      </section>

      {active ? <ActiveDriverCard active={active} /> : (
        <section className="panel">
          <h2>No live driver currently</h2>
          <p className="muted">Admin can open the next driver when ready.</p>
        </section>
      )}

      {active ? (
        <section className="panel">
          <h3>Place Bid</h3>
          <form className="bid-form" onSubmit={submitBid}>
            <div className="currency-prefix">$</div>
            <input
              value={bidInput}
              onChange={(e) => setBidInput(e.target.value)}
              placeholder="0"
              inputMode="decimal"
            />
            <button className="btn" type="submit">Bid</button>
          </form>
          {bidError ? <p className="error-text">{bidError}</p> : null}
        </section>
      ) : null}

      {soldMessage ? (
        <section className="panel note-panel">{soldMessage}</section>
      ) : null}

      <section className="two-col">
        <div className="panel">
          <h3>Recent Bids</h3>
          {!recentBids.length ? <p className="muted">No bids yet.</p> : (
            <ul className="list">
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

        <div className="panel">
          <h3>Sold Drivers</h3>
          {!soldByOwner.length ? <p className="muted">No sales yet.</p> : (
            <div className="stack">
              {soldByOwner.map((owner) => (
                <article key={owner.ownerId} className="owner-card">
                  <div className="row between">
                    <div className="row gap-sm">
                      <ParticipantAvatar name={owner.ownerName} color={owner.ownerColor} />
                      <strong>{owner.ownerName}</strong>
                    </div>
                    <strong>{fmtCents(owner.totalCents)}</strong>
                  </div>
                  <ul className="chip-list">
                    {owner.drivers.map((driver) => (
                      <li key={driver.id}>{driver.driver_code} {fmtCents(driver.final_price_cents)}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
