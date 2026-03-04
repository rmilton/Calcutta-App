import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [participant, setParticipant] = useState(undefined); // undefined = loading

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setParticipant(data.participant || null))
      .catch(() => setParticipant(null));
  }, []);

  const join = async (name, inviteCode) => {
    const r = await fetch('/api/auth/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, inviteCode }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to join');
    setParticipant(data.participant);
    return data.participant;
  };

  const adminLogin = async (password) => {
    const r = await fetch('/api/auth/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Wrong password');
    setParticipant(data.participant);
    return data.participant;
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setParticipant(null);
  };

  return (
    <AuthContext.Provider value={{ participant, join, adminLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
