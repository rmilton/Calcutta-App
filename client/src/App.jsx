import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
// Note: BrowserRouter is rendered in App() below so TournamentProvider can use useSearchParams
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { TournamentProvider } from './context/TournamentContext';
import Nav from './components/Nav';
import AiCommentary from './components/AiCommentary';
import Join from './pages/Join';
import Auction from './pages/Auction';
import Bracket from './pages/Bracket';
import Standings from './pages/Standings';
import MyTeams from './pages/MyTeams';
import Admin from './pages/Admin';

function ProtectedRoute({ children, adminOnly = false }) {
  const { participant } = useAuth();
  if (participant === undefined) return <div className="flex items-center justify-center min-h-screen text-slate-400">Loading...</div>;
  if (!participant) return <Navigate to="/join" replace />;
  if (adminOnly && !participant.isAdmin) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { participant } = useAuth();

  return (
    <>
      {participant && <Nav />}
      <main className="min-h-screen">
        <Routes>
          <Route path="/join" element={participant ? <Navigate to="/" replace /> : <Join />} />
          <Route path="/" element={<ProtectedRoute><Auction /></ProtectedRoute>} />
          <Route path="/auction" element={<ProtectedRoute><Auction /></ProtectedRoute>} />
          <Route path="/bracket" element={<ProtectedRoute><Bracket /></ProtectedRoute>} />
          <Route path="/standings" element={<ProtectedRoute><Standings /></ProtectedRoute>} />
          <Route path="/my-teams" element={<ProtectedRoute><MyTeams /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
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
          <TournamentProvider>
            <AppRoutes />
            <AiCommentary />
          </TournamentProvider>
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}
