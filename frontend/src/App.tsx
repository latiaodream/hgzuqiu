import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './components/Layout/MainLayout';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import AccountsPage from './pages/AccountsPage';
import GroupsPage from './pages/GroupsPage';
import BettingPage from './pages/BettingPage';
import CoinsPage from './pages/CoinsPage';
import MatchesPage from './pages/MatchesPage';
import FetchAccountsPage from './pages/FetchAccountsPage';
import StaffPage from './pages/StaffPage';
import AgentsPage from './pages/AgentsPage';
import SettingsPage from './pages/SettingsPage';
import './App.css';

const App: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: '#f0f2f5'
      }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/auth"
        element={
          isAuthenticated ? <Navigate to="/dashboard" replace /> : <AuthPage />
        }
      />

      <Route path="/login" element={<Navigate to="/auth" replace />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="fetch-accounts" element={<FetchAccountsPage />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="betting" element={<BettingPage />} />
        <Route path="matches" element={<MatchesPage />} />
        <Route path="coins" element={<CoinsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Route>

      <Route
        path="*"
        element={<Navigate to={isAuthenticated ? '/dashboard' : '/auth'} replace />}
      />
    </Routes>
  );
};

export default App;
