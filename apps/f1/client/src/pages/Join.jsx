import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Join() {
  const { join, adminLogin } = useAuth();
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
    <div className="join-grid">
      <section className="panel panel-hero fade-in">
        <div className="hero-kicker">Telemetry Dark</div>
        <h1>F1 Season Calcutta</h1>
        <p>
          Own drivers, track every race weekend, and cash in on category payouts from the shared pool.
        </p>
      </section>

      <section className="panel stagger-in">
        <h2>Join Pool</h2>
        <form onSubmit={handleJoin} className="stack">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </label>
          <label>
            Invite Code
            <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} placeholder="ABC123" />
          </label>
          <button className="btn" disabled={loading}>{loading ? 'Joining...' : 'Join'}</button>
        </form>
      </section>

      <section className="panel stagger-in delay-2">
        <h2>Admin Login</h2>
        <form onSubmit={handleAdmin} className="stack">
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Admin password" />
          </label>
          <button className="btn btn-outline" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
        </form>
        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </div>
  );
}
