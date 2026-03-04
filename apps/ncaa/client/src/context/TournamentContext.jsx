import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSocketEvent } from './SocketContext';
import { useAuth } from './AuthContext';

const TournamentContext = createContext(null);

export function TournamentProvider({ children }) {
  const { participant } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTournamentId, setActiveTournamentIdState] = useState(null);
  const [activeTournament, setActiveTournament] = useState(null);
  const [allTournaments, setAllTournaments] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // The tournament ID being viewed (from ?t= param, or the active one)
  const tParam = searchParams.get('t');
  const viewingTournamentId = tParam ? parseInt(tParam) : activeTournamentId;
  const isViewingHistory = activeTournamentId !== null && viewingTournamentId !== null && viewingTournamentId !== activeTournamentId;

  // Fetch the active tournament on mount and when participant changes
  const fetchActive = useCallback(async () => {
    if (!participant) return;
    try {
      const r = await fetch('/api/tournaments/active', { credentials: 'include' });
      if (!r.ok) return;
      const t = await r.json();
      setActiveTournamentIdState(t.id);
      setActiveTournament(t);
    } catch (_) {}
  }, [participant]);

  useEffect(() => {
    fetchActive();
  }, [fetchActive]);

  // Fetch all tournaments (for admin)
  const fetchAll = useCallback(async () => {
    if (!participant?.isAdmin) return;
    try {
      const r = await fetch('/api/tournaments', { credentials: 'include' });
      if (!r.ok) return;
      const data = await r.json();
      setAllTournaments(data);
    } catch (_) {}
  }, [participant]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Socket: when admin switches tournament, update active and trigger data refresh
  useSocketEvent('tournament:switched', useCallback(({ tournamentId, name }) => {
    setActiveTournamentIdState(tournamentId);
    fetchActive();
    fetchAll();
    // If not viewing history, clear the ?t= param so we see the new active tournament
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('t');
      return next;
    });
    // Bump refreshKey to signal all pages to re-fetch their data
    setRefreshKey((k) => k + 1);
  }, [fetchActive, fetchAll, setSearchParams]));

  const returnToActive = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('t');
      return next;
    });
  }, [setSearchParams]);

  const viewTournament = useCallback((id) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id === activeTournamentId) {
        next.delete('t');
      } else {
        next.set('t', String(id));
      }
      return next;
    });
  }, [activeTournamentId, setSearchParams]);

  // tParam for API calls: undefined when viewing active (so APIs use default), or the tid number
  const apiTParam = isViewingHistory ? `?t=${viewingTournamentId}` : '';

  return (
    <TournamentContext.Provider value={{
      activeTournamentId,
      activeTournament,
      viewingTournamentId,
      isViewingHistory,
      allTournaments,
      refreshKey,
      apiTParam,
      returnToActive,
      viewTournament,
      refreshTournaments: fetchAll,
    }}>
      {children}
    </TournamentContext.Provider>
  );
}

export function useTournament() {
  return useContext(TournamentContext);
}
