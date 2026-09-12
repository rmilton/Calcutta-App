import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import Nav from './components/Nav';
import Join from './pages/Join';
import Guide from './pages/Guide';
import BuiltWithAI from './pages/BuiltWithAI';
import Auction from './pages/Auction';
import Events from './pages/Events';
import Dashboard from './pages/Dashboard';
import MyDrivers from './pages/MyDrivers';
import Admin from './pages/Admin';
import AuctionPage from './pages/admin/AuctionPage';
import ResultsPage from './pages/admin/ResultsPage';
import TestDataPage from './pages/admin/TestDataPage';
import PayoutsPage from './pages/admin/PayoutsPage';

function ProtectedRoute({ children, adminOnly = false, nonAdminOnly = false }) {
  const { participant } = useAuth();

  if (participant === undefined) {
    return (
      <div className="page-shell">
        <div className="loading-panel">Loading...</div>
      </div>
    );
  }

  if (!participant) return <Navigate to="/join" replace />;
  if (adminOnly && !participant.isAdmin) return <Navigate to="/dashboard" replace />;
  if (nonAdminOnly && participant.isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  const { participant } = useAuth();

  return (
    <>
      {participant && <Nav />}
      <main className="page-shell">
        <Routes>
          <Route path="/join" element={participant ? <Navigate to={participant.isAdmin ? '/admin' : '/dashboard'} replace /> : <Join />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/built-with-ai" element={<BuiltWithAI />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/auction" element={<ProtectedRoute><Auction /></ProtectedRoute>} />
          <Route path="/events" element={<ProtectedRoute><Events /></ProtectedRoute>} />
          <Route path="/standings" element={<Navigate to="/dashboard" replace />} />
          <Route path="/my-drivers" element={<ProtectedRoute nonAdminOnly><MyDrivers /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>}>
            <Route index element={<Navigate to="/admin/setup" replace />} />
            <Route path="setup" element={<AuctionPage />} />
            <Route path="race-weekend" element={<ResultsPage />} />
            <Route path="payouts" element={<PayoutsPage />} />
            <Route path="tools" element={<TestDataPage />} />
            {/* Redirects for old URLs */}
            <Route path="overview" element={<Navigate to="/admin/setup" replace />} />
            <Route path="auction" element={<Navigate to="/admin/setup" replace />} />
            <Route path="results" element={<Navigate to="/admin/race-weekend" replace />} />
            <Route path="test-data" element={<Navigate to="/admin/tools" replace />} />
            <Route path="payout-audit" element={<Navigate to="/admin/payouts" replace />} />
            <Route path="audit" element={<Navigate to="/admin/payouts" replace />} />
            <Route path="*" element={<Navigate to="/admin/setup" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
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
