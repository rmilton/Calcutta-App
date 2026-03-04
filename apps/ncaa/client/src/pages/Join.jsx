import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Join() {
  const { join, adminLogin } = useAuth();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [mode, setMode] = useState('join'); // 'join' | 'admin'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inviteFromUrl = (searchParams.get('invite') || '').trim().toUpperCase().slice(0, 8);

  useEffect(() => {
    if (!inviteFromUrl) return;
    setInviteCode(inviteFromUrl);
    setMode('join');
    setError('');
  }, [inviteFromUrl]);

  const handleJoin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await join(name.trim(), inviteCode.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdmin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await adminLogin(adminPassword);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-base flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* ── Hero ── */}
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-glow-sm"
            style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}
          >
            <span aria-hidden="true" className="text-3xl leading-none">🏀</span>
          </div>
          <h1 className="text-3xl font-bold text-text-primary">March Madness</h1>
          <p className="text-brand font-semibold text-lg mt-1">Calcutta Tournament</p>
        </div>

        {/* ── Tab switcher ── */}
        <div className="flex bg-surface-input rounded-xl p-1 mb-6 gap-1" role="tablist">
          <button
            role="tab"
            aria-selected={mode === 'join'}
            onClick={() => { setMode('join'); setError(''); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              mode === 'join'
                ? 'bg-surface-raised text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Join as Participant
          </button>
          <button
            role="tab"
            aria-selected={mode === 'admin'}
            onClick={() => { setMode('admin'); setError(''); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              mode === 'admin'
                ? 'bg-surface-raised text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Admin Login
          </button>
        </div>

        {/* ── Join form ── */}
        {mode === 'join' && (
          <form onSubmit={handleJoin} className="card p-6 space-y-5 animate-fade-in" role="tabpanel">
            <div>
              <label className="section-label mb-2 block" htmlFor="join-name">Your Name</label>
              <input
                id="join-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                maxLength={32}
                className="input"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="section-label mb-2 block" htmlFor="join-code">Invite Code</label>
              <input
                id="join-code"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase().slice(0, 8))}
                placeholder="XXXXXX"
                maxLength={8}
                className="input font-mono tracking-widest"
                required
              />
              {inviteFromUrl && (
                <p className="text-xs text-text-secondary mt-1">
                  Invite code loaded from your link.
                </p>
              )}
            </div>
            {error && (
              <div role="alert" className="badge badge-error w-full justify-start px-3 py-2 rounded-xl text-sm">
                {error}
              </div>
            )}
            <button type="submit" disabled={loading} className="btn-primary btn-lg w-full">
              {loading ? 'Joining…' : 'Join Tournament →'}
            </button>
          </form>
        )}

        {/* ── Admin form ── */}
        {mode === 'admin' && (
          <form onSubmit={handleAdmin} className="card p-6 space-y-5 animate-fade-in" role="tabpanel">
            <div>
              <label className="section-label mb-2 block" htmlFor="admin-password">Admin Password</label>
              <input
                id="admin-password"
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Enter admin password"
                className="input"
                required
                autoFocus
              />
            </div>
            {error && (
              <div role="alert" className="badge badge-error w-full justify-start px-3 py-2 rounded-xl text-sm">
                {error}
              </div>
            )}
            <button type="submit" disabled={loading} className="btn-primary btn-lg w-full">
              {loading ? 'Logging in…' : 'Login as Admin →'}
            </button>
          </form>
        )}

        <p className="text-center text-text-secondary text-sm mt-6">
          Ask your group admin for an invite code or invite link
        </p>
      </div>
    </div>
  );
}
