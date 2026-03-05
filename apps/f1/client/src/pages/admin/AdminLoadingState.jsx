import React from 'react';

export default function AdminLoadingState({ message = 'Loading admin data...' }) {
  return <section className="loading-panel">{message}</section>;
}
