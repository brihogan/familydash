import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import Avatar from '../shared/Avatar.jsx';
import QuickTicketAdjust from './QuickTicketAdjust.jsx';
import QuickBankAdjust from './QuickBankAdjust.jsx';
import LastActivityCell from './LastActivityCell.jsx';
import { formatCents } from '../../utils/formatCents.js';

export default function DashboardRow({ member, onRefresh, readOnly = false, maskPrivateData = false }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isParent = user?.role === 'parent';
  const isOwnRow = member.id === user?.id;
  // Parents can interact with any kid row; kids can only interact with their own row
  const isInteractiveKidRow = !readOnly && member.role === 'kid' && (isParent || isOwnRow);
  // Name navigation: parents go to any kid's overview; kids can click their own name
  const nameClickable = isInteractiveKidRow;
  // Balance / tickets / chores navigation is available to both parents and own-kid
  const statsClickable = isInteractiveKidRow;

  const choreLabel = member.choreTotal > 0
    ? `${member.choreDone}/${member.choreTotal}`
    : '—';

  return (
    <tr className={`transition-colors ${isOwnRow ? 'bg-brand-50' : 'hover:bg-gray-50'}`}>
      {/* Name → History (parent only) */}
      <td
        className={`px-4 py-3 ${isOwnRow ? 'border-l-2 border-brand-500' : ''} ${nameClickable ? 'cursor-pointer' : ''}`}
        onClick={nameClickable ? () => navigate(`/kid/${member.id}`) : undefined}
      >
        <div className="flex items-center gap-3">
          <Avatar name={member.name} color={member.avatarColor} emoji={member.avatarEmoji} size="sm" />
          <div>
            <p className={`font-medium text-sm ${nameClickable ? 'hover:text-brand-600' : ''}`}>{member.name}</p>
            <p className="text-xs text-gray-400 capitalize">{member.role}</p>
          </div>
        </div>
      </td>

      {/* Balance → Bank */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <span
            className={`text-sm font-mono ${statsClickable ? 'cursor-pointer hover:text-brand-600' : ''}`}
            onClick={statsClickable ? () => navigate(`/bank/${member.id}`) : undefined}
          >
            {maskPrivateData && !member.showBalanceOnDashboard && !isOwnRow
              ? <span className="text-gray-400 tracking-widest">—&thinsp;—&thinsp;—</span>
              : formatCents(member.mainBalanceCents)
            }
          </span>
          {!readOnly && isParent && member.role === 'kid' && (
            <QuickBankAdjust userId={member.id} onDone={onRefresh} />
          )}
        </div>
      </td>

      {/* Tickets */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <span
            className={`text-sm font-medium ${statsClickable ? 'cursor-pointer hover:text-brand-600' : ''}`}
            onClick={statsClickable ? () => navigate(`/tickets/${member.id}`) : undefined}
          >
            {member.ticketBalance}
          </span>
          {!readOnly && isParent && member.role === 'kid' && (
            <QuickTicketAdjust userId={member.id} ticketBalance={member.ticketBalance} onDone={onRefresh} />
          )}
        </div>
      </td>

      {/* Chores → Chores page */}
      <td
        className={`px-4 py-3 ${statsClickable ? 'cursor-pointer hover:opacity-75' : ''}`}
        onClick={statsClickable ? () => navigate(`/chores/${member.id}`) : undefined}
      >
        {member.choreTotal > 0 ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-100 rounded-full h-2 w-24">
              <div
                className="bg-brand-500 h-2 rounded-full transition-all"
                style={{ width: `${(member.choreDone / member.choreTotal) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-500">{choreLabel}</span>
          </div>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>

      <td className="px-4 py-3">
        <LastActivityCell display={member.lastActivityDisplay} />
      </td>
    </tr>
  );
}
