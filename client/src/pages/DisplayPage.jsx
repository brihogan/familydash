import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '../api/dashboard.api.js';
import { familyApi } from '../api/family.api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilySettings } from '../context/FamilySettingsContext.jsx';
import DashboardTable from '../components/dashboard/DashboardTable.jsx';

const REFRESH_INTERVAL_MS = 60_000;

function buildSortOptions(choreLabel) {
  return [
    { key: 'custom',  label: 'Custom Order' },
    { key: 'balance', label: 'Bank Balance' },
    { key: 'tickets', label: 'Tickets' },
    { key: 'chores',  label: `${choreLabel} Progress` },
  ];
}

function sortMembers(members, sortKey) {
  const copy = [...members];
  switch (sortKey) {
    case 'balance':
      return copy.sort((a, b) => b.mainBalanceCents - a.mainBalanceCents);
    case 'tickets':
      return copy.sort((a, b) => b.ticketBalance - a.ticketBalance);
    case 'chores':
      return copy.sort((a, b) => {
        const aPct = a.choreTotal > 0 ? a.choreDone / a.choreTotal : 0;
        const bPct = b.choreTotal > 0 ? b.choreDone / b.choreTotal : 0;
        return bPct - aPct;
      });
    case 'custom':
    default:
      return copy.sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.name.localeCompare(b.name);
      });
  }
}

export default function DisplayPage() {
  const { logout } = useAuth();
  const { choreLabel } = useFamilySettings();
  const SORT_OPTIONS = buildSortOptions(choreLabel);
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [familyName, setFamilyName] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [sortKey, setSortKey] = useState('custom');

  const fetchData = useCallback(async () => {
    const [dashData, familyData] = await Promise.all([
      dashboardApi.getDashboard(),
      familyApi.getFamily(),
    ]);
    setMembers(dashData.members);
    setFamilyName(familyData.family.name);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const sortedMembers = useMemo(
    () => sortMembers(members.filter((m) => m.showOnDashboard || (m.role === 'parent' && m.choresEnabled)), sortKey),
    [members, sortKey]
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-brand-600">
            {familyName ? `${familyName} Dashboard` : 'Family Dashboard'}
          </span>
          {lastUpdated && (
            <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Logout
        </button>
      </header>

      {/* Sort controls */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-6 py-2 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400 dark:text-gray-500 mr-1">Sort:</span>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSortKey(opt.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              sortKey === opt.key
                ? 'bg-brand-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <main className="flex-1 p-6">
        {sortedMembers.length > 0 && (
          <DashboardTable members={sortedMembers} readOnly maskPrivateData />
        )}
      </main>
    </div>
  );
}
