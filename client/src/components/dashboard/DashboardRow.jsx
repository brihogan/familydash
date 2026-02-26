import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBroom, faCrown } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../context/AuthContext.jsx';
import { useFamilySettings } from '../../context/FamilySettingsContext.jsx';
import Avatar from '../shared/Avatar.jsx';
import { IconDisplay } from '../shared/IconPicker.jsx';
import QuickTicketAdjust from './QuickTicketAdjust.jsx';
import QuickBankAdjust from './QuickBankAdjust.jsx';
import LastActivityCell from './LastActivityCell.jsx';
import ProgressRing from './ProgressRing.jsx';
import { formatCents } from '../../utils/formatCents.js';

export default function DashboardRow({ member, onRefresh, readOnly = false, maskPrivateData = false }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { useBanking, useSets, useTickets } = useFamilySettings();
  const isParent = user?.role === 'parent';
  const isOwnRow = member.id === user?.id;
  // Parents can interact with any kid row; kids can only interact with their own row
  const isInteractiveKidRow = !readOnly && member.role === 'kid' && (isParent || isOwnRow);
  // Name navigation: parents go to any kid's overview; kids can click their own name
  const nameClickable = isInteractiveKidRow;
  // Balance / tickets / chores navigation is available to both parents and own-kid
  const statsClickable = isInteractiveKidRow;

  const chorePct  = member.choreTotal > 0 ? Math.round((member.choreDone / member.choreTotal) * 100) : 0;
  const choreDone = member.choreTotal > 0 && member.choreDone === member.choreTotal;

  return (
    <tr className={`transition-colors ${isOwnRow ? 'bg-brand-50 dark:bg-indigo-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
      {/* Name → History (parent only) */}
      <td
        className={`px-4 py-3 whitespace-nowrap ${isOwnRow ? 'border-l-2 border-brand-500' : ''} ${nameClickable ? 'cursor-pointer' : ''}`}
        onClick={nameClickable ? () => navigate(`/kid/${member.id}`) : undefined}
      >
        <div className="flex items-center gap-3">
          <Avatar name={member.name} color={member.avatarColor} emoji={member.avatarEmoji} size="lg" />
          <div>
            <p className={`font-medium text-sm ${nameClickable ? 'hover:text-brand-600' : ''}`}>{member.name}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 capitalize">{member.role}</p>
          </div>
        </div>
      </td>

      {/* Balance → Bank */}
      {useBanking && (
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center justify-center gap-2">
            <span
              className={`text-sm font-mono ${statsClickable ? 'cursor-pointer hover:text-brand-600' : ''}`}
              onClick={statsClickable ? () => navigate(`/bank/${member.id}`) : undefined}
            >
              {maskPrivateData && !member.showBalanceOnDashboard && !isOwnRow
                ? <span className="text-gray-400 dark:text-gray-500 tracking-widest">—&thinsp;—&thinsp;—</span>
                : formatCents(member.mainBalanceCents)
              }
            </span>
            {!readOnly && isParent && member.role === 'kid' && (
              <QuickBankAdjust userId={member.id} onDone={onRefresh} />
            )}
          </div>
        </td>
      )}

      {/* Tickets */}
      {useTickets && (
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center justify-center gap-2">
            <span
              className={`text-sm font-medium ${statsClickable ? 'cursor-pointer hover:text-brand-600' : ''}`}
              onClick={statsClickable ? () => navigate(`/tickets/${member.id}`) : undefined}
            >
              {member.ticketBalance} 🎟
            </span>
            {!readOnly && isParent && member.role === 'kid' && (
              <QuickTicketAdjust userId={member.id} ticketBalance={member.ticketBalance} onDone={onRefresh} />
            )}
          </div>
        </td>
      )}

      {/* Trophies */}
      <td className="px-2 py-3 whitespace-nowrap text-center">
        {member.role === 'kid' ? (
          <span
            className={`text-sm font-medium text-amber-500 dark:text-amber-400 ${statsClickable ? 'cursor-pointer hover:text-amber-600' : ''}`}
            onClick={statsClickable ? () => navigate(`/trophies/${member.id}`) : undefined}
          >
            {member.trophyCount}
          </span>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
        )}
      </td>

      {/* Progress: chore ring + task rings */}
      <td className="px-4 py-3 whitespace-nowrap">
        {member.role === 'kid' ? (
          <div className="flex items-center gap-1">
            {/* Chore ring */}
            <div className="rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
              <ProgressRing
                pct={chorePct}
                done={choreDone}
                size={56}
                title={`Chores: ${member.choreDone}/${member.choreTotal}`}
                onClick={statsClickable ? (e) => { e.stopPropagation(); navigate(`/chores/${member.id}`); } : undefined}
              >
                <FontAwesomeIcon icon={choreDone ? faCrown : faBroom} className={choreDone ? 'text-yellow-400' : undefined} />
              </ProgressRing>
            </div>
            {/* Task set rings — half-size, 2 per column, fill vertically first */}
            {useSets && (member.taskSets || []).length > 0 && (
              <div
                className="grid gap-0.5"
                style={{ gridTemplateRows: 'repeat(2, auto)', gridAutoFlow: 'column' }}
              >
                {(member.taskSets || []).map((ts) => {
                  const pct = ts.stepCount > 0 ? Math.round((ts.completedCount / ts.stepCount) * 100) : 0;
                  return (
                    <ProgressRing
                      key={ts.id}
                      pct={pct}
                      done={pct === 100}
                      size={27}
                      title={ts.name}
                      onClick={statsClickable ? (e) => { e.stopPropagation(); navigate(`/tasks/${member.id}/${ts.id}`); } : undefined}
                    >
                      <IconDisplay value={ts.emoji} fallback="📋" />
                    </ProgressRing>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
        )}
      </td>

      <td className="px-4 py-3 max-w-0">
        <LastActivityCell display={member.lastActivityDisplay} />
      </td>
    </tr>
  );
}
