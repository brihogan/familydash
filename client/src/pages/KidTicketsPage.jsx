import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTicket, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { ticketsApi } from '../api/tickets.api.js';
import { familyApi } from '../api/family.api.js';
import { useAuth } from '../context/AuthContext.jsx';
import TicketBalance from '../components/tickets/TicketBalance.jsx';
import TicketLedger from '../components/tickets/TicketLedger.jsx';
import QuickTicketAdjust from '../components/dashboard/QuickTicketAdjust.jsx';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';

const DATE_OPTIONS = [
  { key: 'today',     label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d',        label: 'Last 7 days' },
  { key: 'all',       label: 'All' },
];

const SELECT_CLS = 'border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400';

const TICKET_TYPE_OPTIONS = [
  { key: 'all',    label: 'All' },
  { key: 'chore',  label: 'Chore' },
  { key: 'add',    label: 'Add' },
  { key: 'remove', label: 'Remove' },
];

function localMidnightUTC(offsetDays = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (offsetDays) d.setDate(d.getDate() - offsetDays);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

export default function KidTicketsPage() {
  const { userId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isParent = user?.role === 'parent';

  const [ticketBalance, setTicketBalance] = useState(0);
  const [ledger, setLedger] = useState([]);
  const [memberName, setMemberName] = useState('');
  const [kids, setKids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateKey, setDateKey] = useState('today');
  const [ticketTypeKey, setTicketTypeKey] = useState('all');
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const fetch = useCallback(async () => {
    try {
      const params = {};
      if (dateKey === 'today') {
        params.from = localMidnightUTC(0);
      } else if (dateKey === 'yesterday') {
        params.from = localMidnightUTC(1);
        params.to   = localMidnightUTC(0);
      } else if (dateKey === '7d') {
        params.from = localMidnightUTC(6);
      }
      const [ticketData, familyData] = await Promise.all([
        ticketsApi.getTickets(userId, params),
        familyApi.getFamily(),
      ]);
      setTicketBalance(ticketData.ticketBalance);
      setLedger(ticketData.ledger);
      const member = familyData.members.find((m) => m.id === parseInt(userId, 10));
      if (member) setMemberName(member.name);
      if (isParent) setKids(familyData.members.filter((m) => (m.role === 'kid' || !!m.chores_enabled) && m.is_active));
    } finally {
      setLoading(false);
    }
  }, [userId, isParent, dateKey]);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div>
      <div className="mb-6 relative">
        <div className="flex items-center gap-2 min-w-0">
          <FontAwesomeIcon icon={faTicket} className="text-brand-500 text-2xl shrink-0" />
          {isParent && kids.length > 1 ? (
            <button onClick={() => setSwitcherOpen((o) => !o)} className="flex items-center gap-1.5 min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">{memberName || '…'}'s Tickets</h1>
              <FontAwesomeIcon icon={faChevronDown} className={`text-gray-400 text-sm shrink-0 transition-transform ${switcherOpen ? 'rotate-180' : ''}`} />
            </button>
          ) : (
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
              {isParent ? `${memberName || '…'}'s Tickets` : 'My Tickets'}
            </h1>
          )}
        </div>
        {switcherOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setSwitcherOpen(false)} />
            <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[160px]">
              {kids.map((k) => (
                <button
                  key={k.id}
                  onClick={() => { setSwitcherOpen(false); navigate(`/tickets/${k.id}`); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                    String(k.id) === String(userId) ? 'font-semibold text-brand-600 dark:text-brand-400' : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {k.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : (
        <div className="space-y-6">
          <div>
            <div className="max-w-xs mb-3">
              <TicketBalance balance={ticketBalance} />
            </div>
            {isParent && (
              <div className="flex gap-2">
                <QuickTicketAdjust
                  userId={userId}
                  ticketBalance={ticketBalance}
                  onDone={fetch}
                  initialMode="add"
                  variant="button"
                />
                <QuickTicketAdjust
                  userId={userId}
                  ticketBalance={ticketBalance}
                  onDone={fetch}
                  initialMode="remove"
                  variant="button"
                />
              </div>
            )}
          </div>
          <div>
            <div className="mb-3">
              <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-2">History</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400 dark:text-gray-500">Date</span>
                  <select
                    className={SELECT_CLS}
                    value={dateKey}
                    onChange={(e) => setDateKey(e.target.value)}
                  >
                    {DATE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  {TICKET_TYPE_OPTIONS.map((o) => (
                    <button
                      key={o.key}
                      onClick={() => setTicketTypeKey(o.key)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        ticketTypeKey === o.key
                          ? 'bg-brand-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <TicketLedger ledger={(() => {
              if (ticketTypeKey === 'chore')  return ledger.filter((e) => e.type === 'chore_reward');
              if (ticketTypeKey === 'add')    return ledger.filter((e) => e.amount > 0 && e.type !== 'chore_reward');
              if (ticketTypeKey === 'remove') return ledger.filter((e) => e.amount < 0);
              return ledger;
            })()} />
          </div>
        </div>
      )}
    </div>
  );
}
