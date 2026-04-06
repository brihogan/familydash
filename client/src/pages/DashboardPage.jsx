import { useState, useMemo, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHouse, faCompress, faExpand, faArrowDownWideShort, faCheck, faTicket, faArrowsRotate, faClock, faDollarSign, faChevronRight, faPlus } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilySettings } from '../context/FamilySettingsContext.jsx';
import useOfflineDashboard from '../offline/hooks/useOfflineDashboard.js';
import DashboardTable from '../components/dashboard/DashboardTable.jsx';
import TicketBlast from '../components/dashboard/TicketBlast.jsx';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import { turnsApi } from '../api/turns.api.js';
import { claudeApi } from '../api/claude.api.js';
import { familyApi } from '../api/family.api.js';
import Avatar from '../components/shared/Avatar.jsx';
import Modal from '../components/shared/Modal.jsx';
import UnifiedBankDialog from '../components/bank/UnifiedBankDialog.jsx';
import QuickTicketAdjust from '../components/dashboard/QuickTicketAdjust.jsx';

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

function TurnModal({ turn, logs, logging, onLog, onClose }) {
  const current = turn.currentMember;

  const formatDate = (iso) => {
    const d = new Date(iso + (iso.includes('Z') ? '' : 'Z'));
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <Modal open onClose={onClose} title={turn.name}>
      {/* Current turn */}
      {current ? (
        <div className="flex items-center gap-3 p-4 bg-brand-50 dark:bg-brand-500/10 rounded-xl mb-4">
          <Avatar name={current.name} color={current.avatar_color} emoji={current.avatar_emoji} size="md" />
          <div className="flex-1">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Current Turn</p>
            <p className="font-semibold text-gray-900 dark:text-gray-100 text-lg">{current.name}</p>
          </div>
        </div>
      ) : (
        <p className="text-gray-400 dark:text-gray-500 mb-4 italic">No current member set.</p>
      )}

      {/* Log button */}
      <button
        onClick={onLog}
        disabled={logging || !current}
        className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors mb-5"
      >
        {logging ? 'Logging...' : `Log ${current?.name || ''}'s Turn`}
      </button>

      {/* Log history */}
      {logs.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">History</h3>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center gap-2.5 py-2 px-1">
                <Avatar name={log.name} color={log.avatar_color} emoji={log.avatar_emoji} size="sm" />
                <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">{log.name}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(log.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
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

  const [visibleTurns, setVisibleTurns] = useState([]);
  const [activeTurn, setActiveTurn] = useState(null);
  const [turnLogs, setTurnLogs] = useState([]);
  const [loggingTurn, setLoggingTurn] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [fabKid, setFabKid] = useState(null);
  const [fabView, setFabView] = useState('menu'); // 'menu' | 'time'
  const [grantFeedback, setGrantFeedback] = useState('');
  const [claudeAccess, setClaudeAccess] = useState(false);
  const [claudeKids, setClaudeKids] = useState([]);
  const [allKids, setAllKids] = useState([]);
  const [bankOpen, setBankOpen] = useState(false);
  const [bankUserId, setBankUserId] = useState(null);
  const [ticketKid, setTicketKid] = useState(null); // kid whose ticket modal should be opened
  const ticketTriggerRef = useRef(null);

  // Fetch family data once for the FAB menu
  useEffect(() => {
    if (!isParent) return;
    familyApi.getFamily().then((data) => {
      if (data.family?.claude_access) setClaudeAccess(true);
      const kids = (data.members || []).filter((m) => m.role === 'kid' && m.is_active);
      setAllKids(kids);
      setClaudeKids(kids.filter((m) => m.claude_enabled));
    }).catch(() => {});
  }, [isParent]);

  const closeFab = () => {
    setFabOpen(false);
    setFabKid(null);
    setFabView('menu');
    setGrantFeedback('');
  };

  const handleGrantTime = async (minutes) => {
    if (!fabKid) return;
    try {
      await claudeApi.grantTime(fabKid.id, minutes);
      setGrantFeedback(`Gave ${fabKid.name} +${minutes} minutes!`);
      setTimeout(closeFab, 1500);
    } catch {
      setGrantFeedback('Failed to grant time');
      setTimeout(() => setGrantFeedback(''), 2000);
    }
  };

  const handlePickMoney = () => {
    setBankUserId(fabKid.id);
    setBankOpen(true);
    closeFab();
  };

  const handlePickTickets = () => {
    setTicketKid(fabKid);
    closeFab();
  };

  // When ticketKid is set, render QuickTicketAdjust and auto-click its button
  useEffect(() => {
    if (!ticketKid) return;
    // Use a timer to let the component mount, then click its trigger button
    const t = setTimeout(() => {
      if (ticketTriggerRef.current) {
        const btn = ticketTriggerRef.current.querySelector('button');
        if (btn) btn.click();
      }
    }, 50);
    return () => clearTimeout(t);
  }, [ticketKid]);

  const loadVisibleTurns = () => {
    turnsApi.getVisibleTurns()
      .then((data) => setVisibleTurns(data.turns))
      .catch(() => {});
  };
  useEffect(() => { loadVisibleTurns(); }, []);

  const openTurnModal = async (turn) => {
    setActiveTurn(turn);
    try {
      const data = await turnsApi.getTurnLogs(turn.id);
      setTurnLogs(data.logs);
    } catch { setTurnLogs([]); }
  };

  const handleLogTurn = async () => {
    if (!activeTurn) return;
    setLoggingTurn(true);
    try {
      const updated = await turnsApi.logTurn(activeTurn.id);
      setActiveTurn((prev) => ({
        ...prev,
        currentMember: updated.members.find((m) => m.is_current) || null,
      }));
      setTurnLogs(updated.logs);
      loadVisibleTurns();
    } catch { /* ignore */ }
    setLoggingTurn(false);
  };

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

      {/* Turns */}
      {visibleTurns.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-4">
          {visibleTurns.map((t) => {
            const daysAgo = t.lastLoggedAt
              ? Math.floor((Date.now() - new Date(t.lastLoggedAt + 'Z').getTime()) / 86400000)
              : null;
            return (
              <button
                key={t.id}
                onClick={() => openTurnModal(t)}
                className="text-left px-3.5 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm hover:border-brand-300 dark:hover:border-brand-500/50 transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <FontAwesomeIcon icon={faArrowsRotate} className="text-brand-400 text-xs" />
                  <span className="text-gray-500 dark:text-gray-400">{t.name}:</span>
                  {t.currentMember ? (
                    <span className="flex items-center gap-1.5 font-semibold text-gray-900 dark:text-gray-100">
                      <Avatar
                        name={t.currentMember.name}
                        color={t.currentMember.avatar_color}
                        emoji={t.currentMember.avatar_emoji}
                        size="sm"
                      />
                      {t.currentMember.name}
                    </span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500 italic">none</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 pl-5">
                  {daysAgo === null
                    ? 'No turns logged yet'
                    : daysAgo === 0
                      ? 'Last turn logged: today'
                      : `Last turn logged: ${daysAgo}d ago`}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Turn modal */}
      {activeTurn && <TurnModal
        turn={activeTurn}
        logs={turnLogs}
        logging={loggingTurn}
        onLog={handleLogTurn}
        onClose={() => setActiveTurn(null)}
      />}

      {/* Quick actions FAB (parents only) */}
      {isParent && allKids.length > 0 && (
        <button
          onClick={() => { setFabOpen(true); setFabKid(null); setFabView('menu'); }}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-brand-600 hover:bg-brand-700 text-white shadow-lg flex items-center justify-center z-40 transition-transform hover:scale-105"
          title="Quick actions"
          style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        >
          <FontAwesomeIcon icon={faPlus} className="text-xl" />
        </button>
      )}

      {/* Quick actions modal */}
      <Modal open={fabOpen} onClose={closeFab} title="Quick Actions">
        {grantFeedback ? (
          <div className="py-6 text-center text-gray-700 dark:text-gray-300">{grantFeedback}</div>
        ) : !fabKid ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Pick a kid:</p>
            {allKids.map((kid) => (
              <button
                key={kid.id}
                onClick={() => { setFabKid(kid); setFabView('menu'); }}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
              >
                <Avatar name={kid.name} color={kid.avatar_color} emoji={kid.avatar_emoji} size="sm" />
                <span className="font-medium text-gray-900 dark:text-gray-100">{kid.name}</span>
              </button>
            ))}
          </div>
        ) : fabView === 'menu' ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Quick action for <span className="font-semibold text-gray-900 dark:text-gray-100">{fabKid.name}</span>:
            </p>
            {useBanking && (
              <button
                onClick={handlePickMoney}
                className="w-full flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
              >
                <span className="w-9 h-9 rounded-full bg-green-50 dark:bg-green-500/20 text-green-600 dark:text-green-400 flex items-center justify-center">
                  <FontAwesomeIcon icon={faDollarSign} />
                </span>
                <span className="flex-1 font-medium text-gray-900 dark:text-gray-100">Money</span>
                <FontAwesomeIcon icon={faChevronRight} className="text-gray-400 text-xs" />
              </button>
            )}
            {useTickets && (
              <button
                onClick={handlePickTickets}
                className="w-full flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
              >
                <span className="w-9 h-9 rounded-full bg-amber-50 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <FontAwesomeIcon icon={faTicket} />
                </span>
                <span className="flex-1 font-medium text-gray-900 dark:text-gray-100">Tickets</span>
                <FontAwesomeIcon icon={faChevronRight} className="text-gray-400 text-xs" />
              </button>
            )}
            {claudeAccess && fabKid.claude_enabled && (
              <button
                onClick={() => setFabView('time')}
                className="w-full flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
              >
                <span className="w-9 h-9 rounded-full bg-purple-50 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <FontAwesomeIcon icon={faClock} />
                </span>
                <span className="flex-1 font-medium text-gray-900 dark:text-gray-100">App Time</span>
                <FontAwesomeIcon icon={faChevronRight} className="text-gray-400 text-xs" />
              </button>
            )}
            <button
              onClick={() => setFabKid(null)}
              className="w-full mt-2 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              ← Back to kid list
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Grant bonus app time to <span className="font-semibold text-gray-900 dark:text-gray-100">{fabKid.name}</span>:
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[15, 30, 45, 60].map((m) => (
                <button
                  key={m}
                  onClick={() => handleGrantTime(m)}
                  className="p-4 rounded-lg bg-purple-50 dark:bg-purple-500/20 hover:bg-purple-100 dark:hover:bg-purple-500/30 text-purple-700 dark:text-purple-300 font-semibold transition-colors"
                >
                  +{m} min
                </button>
              ))}
            </div>
            <button
              onClick={() => setFabView('menu')}
              className="w-full mt-2 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              ← Back
            </button>
          </div>
        )}
      </Modal>

      {/* Controlled bank dialog — opened from the FAB */}
      {bankOpen && bankUserId && (
        <UnifiedBankDialog
          open={bankOpen}
          onClose={() => { setBankOpen(false); setBankUserId(null); }}
          userId={bankUserId}
          initialMode="deposit"
          onSuccess={() => { setBankOpen(false); setBankUserId(null); refresh(); }}
        />
      )}

      {/* Hidden ticket adjust trigger — auto-clicked when ticketKid is set */}
      {ticketKid && (
        <div ref={ticketTriggerRef} style={{ position: 'absolute', left: -9999, top: -9999 }} aria-hidden="true">
          <QuickTicketAdjust
            key={`tkt-${ticketKid.id}-${Date.now()}`}
            userId={ticketKid.id}
            ticketBalance={ticketKid.ticket_balance || 0}
            onDone={() => { setTicketKid(null); refresh(); }}
          />
        </div>
      )}
    </div>
  );
}
