import React, { useEffect, useState } from 'react';

export default function CountdownTimer({ endTime, compact = false }) {
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
  const isDone = timeLeft === 0;

  const formatted = `${String(Math.floor(seconds / 60)).padStart(1, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  if (compact) {
    const isUrgent = seconds <= 10 && seconds > 0;
    return (
      <div role="timer" aria-live="off" aria-label={`${seconds} seconds remaining`} className="text-right shrink-0">
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Time Left</div>
        <div className={`font-mono font-bold tabular-nums text-xl ${
          isDone ? 'text-slate-500' : isUrgent ? 'text-red-400 motion-safe:animate-pulse' : 'text-green-400'
        }`}>
          {formatted}
        </div>
      </div>
    );
  }

  const isUrgent = seconds <= 5 && seconds > 0;

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
        {formatted}
      </div>
    </div>
  );
}
