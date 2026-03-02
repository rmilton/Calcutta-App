import React, { useEffect, useState } from 'react';

export default function CountdownTimer({ endTime }) {
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!endTime) { setTimeLeft(0); return; }

    const tick = () => {
      const remaining = Math.max(0, endTime - Date.now());
      setTimeLeft(remaining);
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endTime]);

  const seconds = Math.ceil(timeLeft / 1000);
  const isUrgent = seconds <= 5 && seconds > 0;
  const isDone = timeLeft === 0;

  return (
    <div
      role="timer"
      aria-live="off"
      aria-label={`${seconds} second${seconds !== 1 ? 's' : ''} remaining`}
      className={`text-center ${isUrgent ? 'motion-safe:animate-pulse' : ''}`}
    >
      <div className={`text-5xl font-mono font-bold tabular-nums ${
        isDone ? 'text-text-secondary' : isUrgent ? 'text-red-400' : 'text-green-400'
      }`}>
        {String(Math.floor(seconds / 60)).padStart(1, '0')}:{String(seconds % 60).padStart(2, '0')}
      </div>
    </div>
  );
}
