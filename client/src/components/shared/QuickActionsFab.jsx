import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faDollarSign, faTicket, faClock, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../context/AuthContext.jsx';
import { useFamilySettings } from '../../context/FamilySettingsContext.jsx';
import { familyApi } from '../../api/family.api.js';
import { claudeApi } from '../../api/claude.api.js';
import Avatar from './Avatar.jsx';
import Modal from './Modal.jsx';
import UnifiedBankDialog from '../bank/UnifiedBankDialog.jsx';
import QuickTicketAdjust from '../dashboard/QuickTicketAdjust.jsx';

/**
 * Floating action button for parent quick actions — pick a kid, then:
 * - Money (opens UnifiedBankDialog)
 * - Tickets (opens QuickTicketAdjust)
 * - App Time (grants bonus Claude Code time)
 *
 * Mounted globally in Layout so it appears on every page.
 * The full-screen terminal/workspace has a higher z-index and covers it.
 */
export default function QuickActionsFab() {
  const { user } = useAuth();
  const { useBanking, useTickets } = useFamilySettings();
  const isParent = user?.role === 'parent';

  const [fabOpen, setFabOpen] = useState(false);
  const [fabKid, setFabKid] = useState(null);
  const [fabView, setFabView] = useState('menu');
  const [grantFeedback, setGrantFeedback] = useState('');
  const [claudeAccess, setClaudeAccess] = useState(false);
  const [allKids, setAllKids] = useState([]);
  const [bankOpen, setBankOpen] = useState(false);
  const [bankUserId, setBankUserId] = useState(null);
  const [ticketKid, setTicketKid] = useState(null);
  const [ticketOpen, setTicketOpen] = useState(false);

  useEffect(() => {
    if (!isParent) return;
    familyApi.getFamily().then((data) => {
      if (data.family?.claude_access) setClaudeAccess(true);
      setAllKids((data.members || []).filter((m) => m.role === 'kid' && m.is_active));
    }).catch(() => {});
  }, [isParent]);

  if (!isParent || allKids.length === 0) return null;

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
    setTicketOpen(true);
    closeFab();
  };

  return (
    <>
      <button
        onClick={() => { setFabOpen(true); setFabKid(null); setFabView('menu'); }}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-brand-600 hover:bg-brand-700 text-white shadow-lg flex items-center justify-center z-40 transition-transform hover:scale-105"
        title="Quick actions"
        style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <FontAwesomeIcon icon={faPlus} className="text-xl" />
      </button>

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

      {/* Bank dialog */}
      {bankOpen && bankUserId && (
        <UnifiedBankDialog
          open={bankOpen}
          onClose={() => { setBankOpen(false); setBankUserId(null); }}
          userId={bankUserId}
          initialMode="deposit"
          onSuccess={() => { setBankOpen(false); setBankUserId(null); }}
        />
      )}

      {/* Ticket dialog (controlled) */}
      {ticketKid && (
        <QuickTicketAdjust
          key={`tkt-${ticketKid.id}`}
          variant="none"
          userId={ticketKid.id}
          ticketBalance={ticketKid.ticket_balance || 0}
          controlledOpen={ticketOpen}
          onControlledClose={() => { setTicketOpen(false); setTicketKid(null); }}
          onDone={() => { setTicketOpen(false); setTicketKid(null); }}
        />
      )}
    </>
  );
}
