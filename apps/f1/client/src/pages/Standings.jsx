import React, { useCallback, useEffect, useState } from 'react';
import { useSocketEvent } from '../context/SocketContext';
import { api, fmtCents } from '../utils';

export default function Standings() {
  const [rows, setRows] = useState([]);
  const [totalPotCents, setTotalPotCents] = useState(0);

  const refresh = useCallback(async () => {
    const response = await api('/standings');
    const data = await response.json();
    setRows(data.standings || []);
    setTotalPotCents(data.totalPotCents || 0);
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  useSocketEvent('standings:update', useCallback(() => {
    refresh().catch(() => {});
  }, [refresh]));

  return (
    <div className="stack-lg">
      <section className="panel telemetry-strip stagger-in">
        <div className="strip-item">
          <span className="label">Total Pot</span>
          <strong>{fmtCents(totalPotCents)}</strong>
        </div>
        <div className="strip-item">
          <span className="label">Participants</span>
          <strong>{rows.length}</strong>
        </div>
      </section>

      <section className="panel">
        <h2>Standings</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Participant</th>
                <th>Drivers</th>
                <th>Spent</th>
                <th>Earned</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const net = row.total_earned_cents - row.total_spent_cents;
                return (
                  <tr key={row.id}>
                    <td>{idx + 1}</td>
                    <td>{row.name}</td>
                    <td>{row.drivers_owned}</td>
                    <td>{fmtCents(row.total_spent_cents)}</td>
                    <td>{fmtCents(row.total_earned_cents)}</td>
                    <td className={net >= 0 ? 'text-pos' : 'text-neg'}>{fmtCents(net)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
