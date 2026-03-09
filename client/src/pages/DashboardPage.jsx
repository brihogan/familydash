import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExpand, faHouse } from '@fortawesome/free-solid-svg-icons';
import { dashboardApi } from '../api/dashboard.api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilySettings } from '../context/FamilySettingsContext.jsx';
import DashboardTable from '../components/dashboard/DashboardTable.jsx';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';

const SORT_OPTIONS = [
  { key: 'custom',  label: 'Default Order' },
  { key: 'balance', label: 'Bank Balance' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'chores',  label: 'Chore Progress' },
];

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

export default function DashboardPage() {
  const { user } = useAuth();
  const { useBanking, useTickets } = useFamilySettings();
  const isParent = user?.role === 'parent';
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState('custom');

  const lastFetchRef = useRef(Date.now());
  const REFRESH_MS = 60 * 60 * 1000; // 1 hour

  const fetchDashboard = useCallback(async () => {
    lastFetchRef.current = Date.now();
    try {
      const data = await dashboardApi.getDashboard();
      setMembers(data.members);
    } catch {
      setError('Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Periodic auto-refresh every hour
  useEffect(() => {
    const interval = setInterval(fetchDashboard, REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  // Refresh immediately when the tab becomes visible again after 1+ hour
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetchRef.current >= REFRESH_MS) {
        fetchDashboard();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchDashboard]);

  const sortedMembers = useMemo(
    () => sortMembers(members.filter((m) => m.showOnDashboard || (m.role === 'parent' && m.choresEnabled)), sortKey),
    [members, sortKey],
  );

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            <FontAwesomeIcon icon={faHouse} className="mr-2 text-brand-500" />
            Dashboard
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchDashboard}
              className="text-sm text-brand-600 hover:underline"
            >
              Refresh
            </button>
            {isParent && (
              <button
                onClick={() => navigate('/display')}
                title="Display view"
                className="text-gray-400 dark:text-gray-500 hover:text-brand-600 transition-colors"
              >
                <FontAwesomeIcon icon={faExpand} />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-gray-500">Sort:</span>
          {/* Mobile: dropdown */}
          <select
            className="md:hidden border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
          >
            {SORT_OPTIONS.filter((opt) => (useBanking || opt.key !== 'balance') && (useTickets || opt.key !== 'tickets')).map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
          {/* Desktop: pill buttons */}
          <div className="hidden md:flex items-center gap-2 flex-wrap">
            {SORT_OPTIONS.filter((opt) => (useBanking || opt.key !== 'balance') && (useTickets || opt.key !== 'tickets')).map((opt) => (
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
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : (
        <DashboardTable
          members={sortedMembers}
          onRefresh={fetchDashboard}
          maskPrivateData={!isParent}
        />
      )}
    </div>
  );
}
