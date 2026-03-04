import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import Nav from './components/Nav';
import Join from './pages/Join';
import Auction from './pages/Auction';
import Events from './pages/Events';
import Standings from './pages/Standings';
import MyDrivers from './pages/MyDrivers';
import Admin from './pages/Admin';

function ProtectedRoute({ children, adminOnly = false }) {
  const { participant } = useAuth();

  if (participant === undefined) {
    return (
      <div className="page-shell">
        <div className="loading-panel">Loading...</div>
      </div>
    );
  }

  if (!participant) return <Navigate to="/join" replace />;
  if (adminOnly && !participant.isAdmin) return <Navigate to="/auction" replace />;
  return children;
}

function AppRoutes() {
  const { participant } = useAuth();

  return (
    <>
      {participant && <Nav />}
      <main className="page-shell">
        <Routes>
          <Route path="/join" element={participant ? <Navigate to={participant.isAdmin ? '/admin' : '/auction'} replace /> : <Join />} />
          <Route path="/" element={<Navigate to="/auction" replace />} />
          <Route path="/auction" element={<ProtectedRoute><Auction /></ProtectedRoute>} />
          <Route path="/events" element={<ProtectedRoute><Events /></ProtectedRoute>} />
          <Route path="/standings" element={<ProtectedRoute><Standings /></ProtectedRoute>} />
          <Route path="/my-drivers" element={<ProtectedRoute><MyDrivers /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/auction" replace />} />
        </Routes>
      </main>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}
