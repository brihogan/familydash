import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExpand, faHouse } from '@fortawesome/free-solid-svg-icons';
import { dashboardApi } from '../api/dashboard.api.js';
import { useAuth } from '../context/AuthContext.jsx';
import DashboardTable from '../components/dashboard/DashboardTable.jsx';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';

const SORT_OPTIONS = [
  { key: 'custom',  label: 'Custom Order' },
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
  const isParent = user?.role === 'parent';
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState('custom');

  const fetchDashboard = useCallback(async () => {
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

  const sortedMembers = useMemo(
    () => sortMembers(members.filter((m) => m.showOnDashboard), sortKey),
    [members, sortKey],
  );

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900">
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
                className="text-gray-400 hover:text-brand-600 transition-colors"
              >
                <FontAwesomeIcon icon={faExpand} />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Sort:</span>
          {/* Mobile: dropdown */}
          <select
            className="md:hidden border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
          {/* Desktop: pill buttons */}
          <div className="hidden md:flex items-center gap-2 flex-wrap">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSortKey(opt.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  sortKey === opt.key
                    ? 'bg-brand-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">
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
