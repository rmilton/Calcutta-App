import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { participant } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!participant) {
      setSocket(null);
      setConnected(false);
      return;
    }

    let sock;
    import('socket.io-client').then(({ io }) => {
      sock = io('/', { withCredentials: true });
      sock.on('connect', () => setConnected(true));
      sock.on('disconnect', () => setConnected(false));
      setSocket(sock);
    });

    return () => {
      if (sock) sock.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [participant?.id]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}

// Convenience hook: subscribe to a socket event with auto-cleanup
export function useSocketEvent(eventName, handler) {
  const { socket } = useSocket();
  useEffect(() => {
    if (!socket || !handler) return;
    socket.on(eventName, handler);
    return () => socket.off(eventName, handler);
  }, [socket, eventName, handler]);
}
