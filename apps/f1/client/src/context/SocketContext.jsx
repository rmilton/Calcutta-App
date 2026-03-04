import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { participant } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!participant) {
      if (socket) socket.close();
      setSocket(null);
      return;
    }

    const nextSocket = io({ withCredentials: true });
    setSocket(nextSocket);

    return () => {
      nextSocket.close();
      setSocket(null);
    };
  }, [participant]);

  const value = useMemo(() => ({ socket }), [socket]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}

export function useSocketEvent(eventName, handler) {
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket || !handler) return;
    socket.on(eventName, handler);
    return () => socket.off(eventName, handler);
  }, [socket, eventName, handler]);
}
