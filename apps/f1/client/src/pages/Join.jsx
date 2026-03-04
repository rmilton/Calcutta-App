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
        <svg viewBox="0 0 1200 700" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="trackStroke" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
              <stop offset="50%" stopColor="rgba(225,6,0,0.55)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.06)" />
            </linearGradient>
            <linearGradient id="carFill" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#960000" />
              <stop offset="55%" stopColor="#e10600" />
              <stop offset="100%" stopColor="#7a0000" />
            </linearGradient>
          </defs>
          <path
            className="track-line"
            d="M-80 530 C 240 435, 390 615, 695 470 S 1230 355, 1330 430"
            stroke="url(#trackStroke)"
            strokeWidth="26"
            fill="none"
            strokeLinecap="round"
          />
          <path
            className="track-line-alt"
            d="M-120 600 C 210 500, 420 690, 735 550 S 1230 450, 1370 520"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
          />
          <g className="join-car">
            <path
              d="M220 338 L318 300 L570 300 L670 338 L800 338 L854 374 L800 410 L670 410 L570 450 L318 450 L220 410 L145 410 L96 374 L145 338 Z"
              fill="url(#carFill)"
            />
            <rect x="394" y="272" width="102" height="29" rx="8" fill="#f6f7fb" opacity="0.8" />
            <path d="M245 326 L140 357 L140 390 L245 390 Z" fill="#d9dbe3" opacity="0.85" />
            <rect x="580" y="326" width="124" height="18" rx="8" fill="#0f131a" opacity="0.65" />
            <circle cx="246" cy="432" r="42" fill="#0e1219" />
            <circle cx="246" cy="432" r="21" fill="#2f3a4f" />
            <circle cx="642" cy="432" r="42" fill="#0e1219" />
            <circle cx="642" cy="432" r="21" fill="#2f3a4f" />
          </g>
        </svg>
      </div>

      <section className="panel panel-hero join-hero">
        <div className="hero-kicker">Telemetry Dark</div>
        <h1>F1 Season Calcutta</h1>
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
