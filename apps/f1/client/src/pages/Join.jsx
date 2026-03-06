import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AUSTRALIAN_GP_START_ISO = '2026-02-22T04:00:00Z';

function formatCountdown(targetMs, nowMs) {
  const remainingMs = targetMs - nowMs;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;

  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  return `${days}d ${hours}h ${minutes}m`;
}

export default function Join() {
  const { join, adminLogin } = useAuth();
  const [mode, setMode] = useState('join');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const countdownText = useMemo(() => {
    const targetMs = Date.parse(AUSTRALIAN_GP_START_ISO);
    return formatCountdown(targetMs, nowMs);
  }, [nowMs]);

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
    <div className="stack join-entry-page">
      <div className="join-landing fade-in">
        <div className="join-bg-graphic" aria-hidden="true">
          <img src="/cadillac-f1-hero.jpg" alt="" />
        </div>

        <section className="join-hero">
          {countdownText ? (
            <div className="join-live-pill">
              <span className="join-live-pill-label">Australian GP Countdown</span>
              <strong className="join-live-pill-value">{countdownText}</strong>
            </div>
          ) : null}
          <h1>
            F1 Season
            <br />
            <span className="join-title-accent">Calcutta</span>
          </h1>
          <p>
            Own drivers, track every race weekend, and cash in on category payouts from the shared pool.
          </p>
          <div className="join-guide-links">
            <Link className="btn join-guide-cta" to="/guide">How It Works</Link>
            <Link className="join-built-link" to="/built-with-ai">Built With AI</Link>
          </div>
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
          <p className="small muted join-guide-secondary">
            New here? <Link className="join-guide-link-inline" to="/guide">Read the F1 Calcutta guide</Link> or see <Link className="join-guide-link-inline" to="/built-with-ai">how the app was built</Link>.
          </p>
        </section>
      </div>
      <footer className="page-copyright">
        <span>© 2026 Ryan Milton.</span>
        <a className="page-copyright-link" href="https://www.linkedin.com/in/ryanmilton/" target="_blank" rel="noreferrer">
          <img src="/tool-logos/linkedin.svg" alt="" aria-hidden="true" />
          <span>LinkedIn</span>
        </a>
      </footer>
    </div>
  );
}
