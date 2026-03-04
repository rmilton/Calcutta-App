import React from 'react';

export default function ParticipantAvatar({ name, color, size = 32, ring = true }) {
  const fontSize = size <= 20 ? 10 : size <= 28 ? 12 : size <= 36 ? 14 : 18;
  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold text-white shrink-0 ${
        ring ? 'ring-2 ring-surface-border' : ''
      }`}
      style={{ width: size, height: size, fontSize, backgroundColor: color }}
      aria-hidden="true"
    >
      {name?.[0]?.toUpperCase()}
    </div>
  );
}
