import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../utils';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [participant, setParticipant] = useState(undefined);

  const refresh = async () => {
    const response = await api('/auth/me');
    const data = await response.json();
    setParticipant(data.participant || null);
  };

  useEffect(() => {
    refresh().catch(() => setParticipant(null));
  }, []);

  const join = async ({ name, inviteCode }) => {
    const response = await api('/auth/join', {
      method: 'POST',
      body: JSON.stringify({ name, inviteCode }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Join failed');
    setParticipant(data.participant);
    return data.participant;
  };

  const adminLogin = async ({ password }) => {
    const response = await api('/auth/admin', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Login failed');
    setParticipant(data.participant);
    return data.participant;
  };

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    setParticipant(null);
  };

  const value = useMemo(() => ({
    participant,
    join,
    adminLogin,
    logout,
    refresh,
  }), [participant]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
