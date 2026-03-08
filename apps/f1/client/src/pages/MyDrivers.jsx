import React, { useCallback, useEffect, useState } from 'react';
import DriverIdentity from '../components/DriverIdentity';
import { useAuth } from '../context/AuthContext';
import useMediaQuery from '../useMediaQuery';
import { api, fmtCents } from '../utils';
import { getTeamColorStyle } from '../teamMeta';

export default function MyDrivers() {
  const { participant } = useAuth();
  const isMobileCards = useMediaQuery('(max-width: 760px)');
  const [drivers, setDrivers] = useState([]);
  const [totalSpentCents, setTotalSpentCents] = useState(0);
  const [totalEarnedCents, setTotalEarnedCents] = useState(0);

  const load = useCallback(async () => {
    if (!participant) return;
    const response = await api(`/standings/participant/${participant.id}`);
    const data = await response.json();
    setDrivers(data.drivers || []);
    setTotalSpentCents(data.totalSpentCents || 0);
    setTotalEarnedCents(data.totalEarnedCents || 0);
  }, [participant]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  return (
    <div className="stack-lg">
      <section className="panel telemetry-strip stagger-in">
        <div className="strip-item">
          <span className="label">Total Spent</span>
          <strong>{fmtCents(totalSpentCents)}</strong>
        </div>
        <div className="strip-item">
          <span className="label">Total Earned</span>
          <strong>{fmtCents(totalEarnedCents)}</strong>
        </div>
        <div className="strip-item">
          <span className="label">Net</span>
          <strong className={totalEarnedCents - totalSpentCents >= 0 ? 'text-pos' : 'text-neg'}>
            {fmtCents(totalEarnedCents - totalSpentCents)}
          </strong>
        </div>
      </section>

      <section className="panel">
        <h2>My Drivers</h2>
        {!drivers.length ? <p className="muted">No drivers purchased yet.</p> : (
          isMobileCards ? (
            <div className="mobile-card-list">
              {drivers.map((driver) => {
                const total = driver.event_earnings_cents + driver.bonus_earnings_cents;
                return (
                  <article key={driver.driver_id} className="mobile-info-card">
                    <div className="mobile-info-card-head">
                      <DriverIdentity
                        driverName={driver.driver_name}
                        driverCode={driver.driver_code}
                        teamName={driver.team_name}
                        compact
                        showCode={false}
                        showTeam={false}
                      />
                      <span
                        className="dashboard-owner-badge"
                        style={getTeamColorStyle({ teamName: driver.team_name, driverCode: driver.driver_code })}
                      >
                        {driver.driver_code}
                      </span>
                    </div>

                    <p className="muted small">
                      <span
                        className="team-accent-text"
                        style={getTeamColorStyle({ teamName: driver.team_name, driverCode: driver.driver_code })}
                      >
                        {driver.team_name}
                      </span>
                    </p>

                    <div className="mobile-stat-grid">
                      <div>
                        <span className="label">Purchase</span>
                        <strong>{fmtCents(driver.purchase_price_cents)}</strong>
                      </div>
                      <div>
                        <span className="label">Event</span>
                        <strong>{fmtCents(driver.event_earnings_cents)}</strong>
                      </div>
                      <div>
                        <span className="label">Bonus</span>
                        <strong>{fmtCents(driver.bonus_earnings_cents)}</strong>
                      </div>
                      <div>
                        <span className="label">Total</span>
                        <strong>{fmtCents(total)}</strong>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Driver</th>
                    <th>Team</th>
                    <th>Purchase</th>
                    <th>Event Earnings</th>
                    <th>Bonus Earnings</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((driver) => {
                    const total = driver.event_earnings_cents + driver.bonus_earnings_cents;
                    return (
                      <tr key={driver.driver_id}>
                        <td>
                          <span
                            className="team-accent-text"
                            style={getTeamColorStyle({ teamName: driver.team_name, driverCode: driver.driver_code })}
                          >
                            {driver.driver_code}
                          </span>
                        </td>
                        <td>
                          <DriverIdentity
                            driverName={driver.driver_name}
                            driverCode={driver.driver_code}
                            teamName={driver.team_name}
                            compact
                            showCode={false}
                            showTeam={false}
                          />
                        </td>
                        <td>
                          <span
                            className="team-accent-text"
                            style={getTeamColorStyle({ teamName: driver.team_name, driverCode: driver.driver_code })}
                          >
                            {driver.team_name}
                          </span>
                        </td>
                        <td>{fmtCents(driver.purchase_price_cents)}</td>
                        <td>{fmtCents(driver.event_earnings_cents)}</td>
                        <td>{fmtCents(driver.bonus_earnings_cents)}</td>
                        <td>{fmtCents(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>
    </div>
  );
}
