import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExpand, faHouse } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilySettings } from '../context/FamilySettingsContext.jsx';
import useOfflineDashboard from '../offline/hooks/useOfflineDashboard.js';
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
  const [sortKey, setSortKey] = useState('custom');

  const { members, loading, refresh } = useOfflineDashboard();

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
              onClick={refresh}
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

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : (
        <DashboardTable
          members={sortedMembers}
          onRefresh={refresh}
          maskPrivateData={!isParent}
        />
      )}
    </div>
  );
}
