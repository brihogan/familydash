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

  const fetch = useCallback(async () => {
    try {
      const [ticketData, familyData] = await Promise.all([
        ticketsApi.getTickets(userId),
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
  }, [userId, isParent]);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          <FontAwesomeIcon icon={faTicket} className="mr-2 text-brand-500" />
          {isParent ? `${memberName || '…'}'s Tickets` : 'My Tickets'}
        </h1>
        {isParent && kids.length > 1 && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-xs text-gray-400">Switch to:</span>
            <select
              value={userId}
              onChange={(e) => navigate(`/tickets/${e.target.value}`)}
              className="text-sm font-medium text-brand-600 border border-brand-200 rounded-lg px-2.5 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-brand-300 cursor-pointer hover:border-brand-400 transition-colors"
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
            <h2 className="text-base font-semibold text-gray-700 mb-3">History</h2>
            <TicketLedger ledger={ledger} />
          </div>
        </div>
      )}
    </div>
  );
}
