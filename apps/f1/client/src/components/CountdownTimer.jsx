import React, { useEffect, useMemo, useState } from 'react';

function formatRemaining(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function CountdownTimer({ endTime }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const remaining = useMemo(() => (endTime || 0) - now, [endTime, now]);
  const critical = remaining <= 10000;

  return (
    <div className={`timer ${critical ? 'timer-critical' : ''}`}>
      {formatRemaining(remaining)}
    </div>
  );
}
