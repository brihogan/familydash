import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTicket } from '@fortawesome/free-solid-svg-icons';
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
      if (isParent) setKids(familyData.members.filter((m) => m.role === 'kid' && m.is_active));
    } finally {
      setLoading(false);
    }
  }, [userId, isParent, dateKey]);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          <FontAwesomeIcon icon={faTicket} className="mr-2 text-brand-500" />
          {isParent ? `${memberName || '…'}'s Tickets` : 'My Tickets'}
        </h1>
        {isParent && kids.length > 1 && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-xs text-gray-400 dark:text-gray-500">Switch to:</span>
            <select
              value={userId}
              onChange={(e) => navigate(`/tickets/${e.target.value}`)}
              className="text-sm font-medium text-brand-600 border border-brand-200 rounded-lg px-2.5 py-1 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-300 cursor-pointer hover:border-brand-400 transition-colors"
            >
              {kids.map((k) => (
                <option key={k.id} value={String(k.id)}>{k.name}</option>
              ))}
            </select>
          </div>
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
