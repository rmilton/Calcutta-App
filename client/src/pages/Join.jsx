import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Join() {
  const { join, adminLogin } = useAuth();
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [mode, setMode] = useState('join'); // 'join' | 'admin'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🏀</div>
          <h1 className="text-3xl font-bold text-white">March Madness</h1>
          <p className="text-orange-400 font-semibold text-lg mt-1">Calcutta Tournament</p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-slate-800 rounded-lg p-1 mb-6">
          <button
            onClick={() => { setMode('join'); setError(''); }}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === 'join' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Join as Participant
          </button>
          <button
            onClick={() => { setMode('admin'); setError(''); }}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === 'admin' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Admin Login
          </button>
        </div>

        {/* Join form */}
        {mode === 'join' && (
          <form onSubmit={handleJoin} className="bg-slate-800 rounded-xl p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Your Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                maxLength={32}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Invite Code</label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="Enter invite code"
                maxLength={8}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent font-mono tracking-widest"
                required
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold py-3 rounded-lg transition-colors"
            >
              {loading ? 'Joining...' : 'Join Tournament'}
            </button>
          </form>
        )}

        {/* Admin form */}
        {mode === 'admin' && (
          <form onSubmit={handleAdmin} className="bg-slate-800 rounded-xl p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Admin Password</label>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Enter admin password"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                required
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold py-3 rounded-lg transition-colors"
            >
              {loading ? 'Logging in...' : 'Login as Admin'}
            </button>
          </form>
        )}

        <p className="text-center text-text-secondary text-sm mt-6">
          Ask your group admin for the invite code
        </p>
      </div>
    </div>
  );
}
