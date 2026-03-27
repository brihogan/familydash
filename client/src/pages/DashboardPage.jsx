import { useState, useMemo, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHouse, faCompress, faExpand, faArrowDownWideShort, faCheck, faTicket } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilySettings } from '../context/FamilySettingsContext.jsx';
import useOfflineDashboard from '../offline/hooks/useOfflineDashboard.js';
import DashboardTable from '../components/dashboard/DashboardTable.jsx';
import TicketBlast from '../components/dashboard/TicketBlast.jsx';
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
  const [sortKey, setSortKey] = useState('custom');
  const [miniCards, setMiniCards] = useState(() => localStorage.getItem('dash_mini') === '1');
  const [sortOpen, setSortOpen] = useState(false);
  const [blastMode, setBlastMode] = useState(false);
  const sortRef = useRef(null);

  const toggleMini = () => {
    setMiniCards((v) => { const next = !v; localStorage.setItem('dash_mini', next ? '1' : '0'); return next; });
  };

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!sortOpen) return;
    const handler = (e) => { if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false); };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [sortOpen]);

  const { members, loading, refresh } = useOfflineDashboard();

  const filteredOptions = SORT_OPTIONS.filter((opt) => (useBanking || opt.key !== 'balance') && (useTickets || opt.key !== 'tickets'));

  const sortedMembers = useMemo(
    () => sortMembers(members.filter((m) => m.showOnDashboard || (m.role === 'parent' && m.choresEnabled)), sortKey),
    [members, sortKey],
  );

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            <FontAwesomeIcon icon={faHouse} className="mr-2 text-brand-500" />
            Dashboard
          </h1>
          <div className="flex items-center gap-2">
            {/* Mobile: mini-card toggle */}
            <button
              onClick={toggleMini}
              className={`md:hidden p-2 rounded-lg transition-colors ${
                miniCards
                  ? 'text-brand-600 dark:text-brand-400'
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
              title={miniCards ? 'Full cards' : 'Compact cards'}
            >
              <FontAwesomeIcon icon={miniCards ? faExpand : faCompress} />
            </button>

            {/* Sort button with dropdown */}
            <div className="relative" ref={sortRef}>
              <button
                onClick={() => setSortOpen((v) => !v)}
                className={`p-2 rounded-lg transition-colors ${
                  sortKey !== 'custom'
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
                title="Sort"
              >
                <FontAwesomeIcon icon={faArrowDownWideShort} />
              </button>
              {sortOpen && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
                  {filteredOptions.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => { setSortKey(opt.key); setSortOpen(false); }}
                      className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between transition-colors ${
                        sortKey === opt.key
                          ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 font-medium'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      {opt.label}
                      {sortKey === opt.key && <FontAwesomeIcon icon={faCheck} className="text-xs" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : (
        <>
          <DashboardTable
            members={sortedMembers}
            onRefresh={refresh}
            maskPrivateData={!isParent}
            miniCards={miniCards}
          />
          {isParent && useTickets && (
            <button
              onClick={() => setBlastMode(true)}
              className="mt-4 w-full py-3 rounded-xl text-sm font-semibold border-2 border-dashed border-amber-300 dark:border-amber-600 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
            >
              <FontAwesomeIcon icon={faTicket} className="mr-2" />
              Ticket Blast
            </button>
          )}
        </>
      )}

      {blastMode && (
        <TicketBlast
          members={sortedMembers}
          onDone={() => setBlastMode(false)}
          onRefresh={refresh}
        />
      )}
    </div>
  );
}
