import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import ProtectedRoute from './components/shared/ProtectedRoute.jsx';
import ParentRoute from './components/shared/ParentRoute.jsx';
import Layout from './components/shared/Layout.jsx';
import { FamilySettingsProvider } from './context/FamilySettingsContext.jsx';
import ToastContainer from './components/shared/Toast.jsx';

import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import KidChoresPage from './pages/KidChoresPage.jsx';
import KidBankPage from './pages/KidBankPage.jsx';
import KidTicketsPage from './pages/KidTicketsPage.jsx';
import RewardsPage from './pages/RewardsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import SettingsUsersPage from './pages/SettingsUsersPage.jsx';
import SettingsUserDetailPage from './pages/SettingsUserDetailPage.jsx';
import SettingsChoresPage from './pages/SettingsChoresPage.jsx';
import SettingsTasksPage from './pages/SettingsTasksPage.jsx';
import KidTasksPage from './pages/KidTasksPage.jsx';
import KidTrophiesPage from './pages/KidTrophiesPage.jsx';
import TaskSetDetailPage from './pages/TaskSetDetailPage.jsx';
import UserTaskDetailPage from './pages/UserTaskDetailPage.jsx';
import KidOverviewPage from './pages/KidOverviewPage.jsx';
import FamilyActivityPage from './pages/FamilyActivityPage.jsx';
import DisplayPage from './pages/DisplayPage.jsx';
import InboxPage from './pages/InboxPage.jsx';
import InboxKidPage from './pages/InboxKidPage.jsx';
import SettingsCommonChoresPage from './pages/SettingsCommonChoresPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import AdminRoute from './components/shared/AdminRoute.jsx';
import SettingsTurnsPage from './pages/SettingsTurnsPage.jsx';
import TurnDetailPage from './pages/TurnDetailPage.jsx';
import ClaudeTerminalPage from './components/claude/ClaudeTerminal.jsx';

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
    <FamilySettingsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<ProtectedRoute />}>
            {/* Kiosk/display view — no sidebar */}
            <Route path="/display" element={<DisplayPage />} />
            <Route path="/terminal/:userId" element={<ClaudeTerminalPage />} />

            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/chores/:userId" element={<KidChoresPage />} />
              <Route path="/bank/:userId" element={<KidBankPage />} />
              <Route path="/tickets/:userId" element={<KidTicketsPage />} />
              <Route path="/tasks/:userId" element={<KidTasksPage />} />
              <Route path="/tasks/:userId/:taskSetId" element={<UserTaskDetailPage />} />
              <Route path="/trophies/:userId" element={<KidTrophiesPage />} />
              <Route path="/task/:id" element={<TaskSetDetailPage />} />
              <Route path="/rewards" element={<RewardsPage />} />
              <Route path="/kid/:userId" element={<KidOverviewPage />} />

              {/* Admin-only routes */}
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminPage />} />
              </Route>

              {/* Parent-only routes */}
              <Route element={<ParentRoute />}>
                <Route path="/inbox" element={<InboxPage />} />
                <Route path="/inbox/:kidId" element={<InboxKidPage />} />
                <Route path="/chore-history/:userId" element={<Navigate to="/dashboard" replace />} />
                <Route path="/family-activity" element={<FamilyActivityPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/settings/users" element={<SettingsUsersPage />} />
                <Route path="/settings/users/:userId" element={<SettingsUserDetailPage />} />
                <Route path="/settings/common-chores" element={<SettingsCommonChoresPage />} />
                <Route path="/settings/chores" element={<SettingsChoresPage />} />
                <Route path="/settings/chores/:userId" element={<SettingsChoresPage />} />
                <Route path="/settings/tasks" element={<SettingsTasksPage />} />
                <Route path="/settings/turns" element={<SettingsTurnsPage />} />
                <Route path="/settings/turns/:id" element={<TurnDetailPage />} />
                <Route path="/settings/rewards" element={<Navigate to="/rewards" replace />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ToastContainer />
      </BrowserRouter>
    </FamilySettingsProvider>
    </AuthProvider>
    </ThemeProvider>
  );
}
