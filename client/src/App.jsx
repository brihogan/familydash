import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import ProtectedRoute from './components/shared/ProtectedRoute.jsx';
import ParentRoute from './components/shared/ParentRoute.jsx';
import Layout from './components/shared/Layout.jsx';

import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import KidChoresPage from './pages/KidChoresPage.jsx';
import KidBankPage from './pages/KidBankPage.jsx';
import KidTicketsPage from './pages/KidTicketsPage.jsx';
import RewardsPage from './pages/RewardsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import SettingsUsersPage from './pages/SettingsUsersPage.jsx';
import SettingsChoresPage from './pages/SettingsChoresPage.jsx';
import KidOverviewPage from './pages/KidOverviewPage.jsx';
import FamilyActivityPage from './pages/FamilyActivityPage.jsx';
import DisplayPage from './pages/DisplayPage.jsx';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<ProtectedRoute />}>
            {/* Kiosk/display view — no sidebar */}
            <Route path="/display" element={<DisplayPage />} />

            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/chores/:userId" element={<KidChoresPage />} />
              <Route path="/bank/:userId" element={<KidBankPage />} />
              <Route path="/tickets/:userId" element={<KidTicketsPage />} />
              <Route path="/rewards" element={<RewardsPage />} />
              <Route path="/kid/:userId" element={<KidOverviewPage />} />

              {/* Parent-only routes */}
              <Route element={<ParentRoute />}>
                <Route path="/chore-history/:userId" element={<Navigate to="/dashboard" replace />} />
                <Route path="/family-activity" element={<FamilyActivityPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/settings/users" element={<SettingsUsersPage />} />
                <Route path="/settings/chores" element={<SettingsChoresPage />} />
                <Route path="/settings/chores/:userId" element={<SettingsChoresPage />} />
                <Route path="/settings/rewards" element={<Navigate to="/rewards" replace />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
