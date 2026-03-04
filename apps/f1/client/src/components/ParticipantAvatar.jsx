import React from 'react';

export default function ParticipantAvatar({ name, color, size = 24 }) {
  const initials = (name || '?')
    .split(' ')
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('') || '?';

  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        backgroundColor: `${color}22`,
        borderColor: `${color}66`,
        color,
      }}
    >
      {initials}
    </span>
  );
}
