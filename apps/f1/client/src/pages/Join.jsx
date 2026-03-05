import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Join() {
  const { join, adminLogin } = useAuth();
  const [mode, setMode] = useState('join');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await join({ name, inviteCode });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdmin = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await adminLogin({ password });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="join-landing fade-in">
      <div className="join-bg-graphic" aria-hidden="true">
        <img src="/cadillac-f1-hero.jpg" alt="" />
      </div>

      <section className="join-hero">
        <div className="join-live-pill">2026 Season Live</div>
        <h1>
          F1 Season
          <br />
          <span className="join-title-accent">Calcutta</span>
        </h1>
        <p>
          Own drivers, track every race weekend, and cash in on category payouts from the shared pool.
        </p>
        <div className="join-hero-cards">
          <div>
            <span className="label">Format</span>
            <div className="value">Live Driver Auction</div>
          </div>
          <div>
            <span className="label">Payouts</span>
            <div className="value">Sprint + Grand Prix</div>
          </div>
          <div>
            <span className="label">Season</span>
            <div className="value">2026</div>
          </div>
        </div>
      </section>

      <section className="panel join-auth-panel stagger-in">
        <div className="join-toggle" role="tablist" aria-label="Entry mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'join'}
            className={`join-toggle-btn ${mode === 'join' ? 'active' : ''}`}
            onClick={() => { setMode('join'); setError(''); }}
          >
            Join Pool
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'admin'}
            className={`join-toggle-btn ${mode === 'admin' ? 'active' : ''}`}
            onClick={() => { setMode('admin'); setError(''); }}
          >
            Admin
          </button>
        </div>

        {mode === 'join' ? (
          <form onSubmit={handleJoin} className="stack">
            <h2>Join Pool</h2>
            <p className="muted small join-mode-copy">
              Enter your invite code to start bidding for drivers.
            </p>
            <label>
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </label>
            <label>
              Invite Code
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                autoComplete="one-time-code"
              />
            </label>
            <button className="btn" disabled={loading}>{loading ? 'Joining...' : 'Join Pool'}</button>
          </form>
        ) : (
          <form onSubmit={handleAdmin} className="stack">
            <h2>Admin Login</h2>
            <p className="muted small join-mode-copy">
              Sign in to control auctions, events, and season settings.
            </p>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Admin password"
                autoComplete="current-password"
              />
            </label>
            <button className="btn btn-outline" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
          </form>
        )}
        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </div>
  );
}
