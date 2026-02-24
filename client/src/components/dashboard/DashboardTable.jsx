import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import Avatar from '../shared/Avatar.jsx';
import QuickTicketAdjust from './QuickTicketAdjust.jsx';
import QuickBankAdjust from './QuickBankAdjust.jsx';
import LastActivityCell from './LastActivityCell.jsx';
import DashboardRow from './DashboardRow.jsx';
import { formatCents } from '../../utils/formatCents.js';

// ── Mobile card ──────────────────────────────────────────────────────────────

function DashboardCard({ member, onRefresh, readOnly, maskPrivateData }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isParent = user?.role === 'parent';
  const isOwnRow = member.id === user?.id;
  const showBalance = !maskPrivateData || member.showBalanceOnDashboard || isOwnRow;
  const isInteractiveKidRow = !readOnly && member.role === 'kid' && (isParent || isOwnRow);
  const nameClickable  = isInteractiveKidRow;
  const statsClickable = isInteractiveKidRow;

  const chorePct = member.choreTotal > 0 ? (member.choreDone / member.choreTotal) * 100 : 0;

  return (
    <div
      className={`bg-white rounded-xl shadow-md overflow-hidden border-2 transition-colors ${
        isOwnRow ? 'border-brand-400' : 'border-transparent border border-gray-200'
      }`}
    >
      {/* ── Colored header banner ── */}
      <div
        className={`px-4 py-4 flex items-center gap-3 ${nameClickable ? 'cursor-pointer' : ''}`}
        style={{ backgroundColor: member.avatarColor }}
        onClick={nameClickable ? () => navigate(`/kid/${member.id}`) : undefined}
      >
        {/* Avatar with circular chore-progress ring */}
        <div className="relative w-[70px] h-[70px] shrink-0">
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 70 70">
            {/* Track */}
            <circle cx="35" cy="35" r="33" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="4" />
            {/* Progress fill */}
            {member.choreTotal > 0 && (
              <circle
                cx="35" cy="35" r="33"
                fill="none"
                stroke="white"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${(chorePct / 100) * 2 * Math.PI * 33} ${2 * Math.PI * 33}`}
              />
            )}
          </svg>
          {/* Avatar — click → /chores */}
          <div
            className={`absolute inset-0 flex items-center justify-center ${isInteractiveKidRow ? 'cursor-pointer' : ''}`}
            onClick={isInteractiveKidRow ? (e) => { e.stopPropagation(); navigate(`/chores/${member.id}`); } : undefined}
          >
            <Avatar name={member.name} color={member.avatarColor} emoji={member.avatarEmoji} size="lg" />
          </div>
        </div>

        {/* Name + role */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white leading-tight drop-shadow-sm">{member.name}</p>
          <p className="text-xs text-white/70 capitalize">{member.role}</p>
        </div>

        {/* Right side: chore count (→ /chores) + You badge */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          {member.choreTotal > 0 && (
            <div
              className={`text-right ${isInteractiveKidRow ? 'cursor-pointer' : ''}`}
              onClick={isInteractiveKidRow ? (e) => { e.stopPropagation(); navigate(`/chores/${member.id}`); } : undefined}
            >
              <p className="text-xl font-bold text-white leading-tight">{member.choreDone}/{member.choreTotal}</p>
              <p className="text-xs text-white/70 text-right">chores</p>
            </div>
          )}
          {isOwnRow && (
            <span className="text-xs bg-white/25 text-white px-2 py-0.5 rounded-full font-medium">You</span>
          )}
        </div>
      </div>

      {/* ── Stats rows ── */}
      <div className="p-4">
        <div className="mb-3 pt-1 pb-3 border-b border-gray-100">
        {/* Row 1: Balance + Tickets side by side */}
        <div className="grid grid-cols-2 gap-3">
          {/* Balance → Bank */}
          <div>
            <p className="text-xs text-gray-400 mb-1">Balance</p>
            <div className="flex items-center gap-2">
              <p
                className={`text-2xl font-mono font-semibold text-gray-800 ${statsClickable ? 'cursor-pointer hover:text-brand-600' : ''}`}
                onClick={statsClickable ? () => navigate(`/bank/${member.id}`) : undefined}
              >
                {showBalance
                  ? formatCents(member.mainBalanceCents)
                  : <span className="text-gray-400 tracking-widest text-base">—&thinsp;—&thinsp;—</span>
                }
              </p>
              {!readOnly && isParent && member.role === 'kid' && (
                <QuickBankAdjust userId={member.id} onDone={onRefresh} large />
              )}
            </div>
          </div>

          {/* Tickets → Tickets page */}
          <div>
            <p className="text-xs text-gray-400 mb-1">Tickets</p>
            <div className="flex items-center gap-2">
              <p
                className={`text-2xl font-semibold text-gray-800 ${statsClickable ? 'cursor-pointer hover:text-brand-600' : ''}`}
                onClick={statsClickable ? () => navigate(`/tickets/${member.id}`) : undefined}
              >
                {member.ticketBalance}
              </p>
              {!readOnly && isParent && member.role === 'kid' && (
                <QuickTicketAdjust userId={member.id} ticketBalance={member.ticketBalance} onDone={onRefresh} large />
              )}
            </div>
          </div>
        </div>

        </div>

        {/* Last activity */}
        {member.lastActivityDisplay && (
          <p className="text-xs text-gray-500 truncate">
            {member.lastActivityDisplay}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Table + cards ─────────────────────────────────────────────────────────────

export default function DashboardTable({ members, onRefresh, readOnly = false, maskPrivateData = false }) {
  return (
    <>
      {/* ── Mobile cards (below md) ── */}
      <div className="md:hidden space-y-3">
        {members.map((m) => (
          <DashboardCard
            key={m.id}
            member={m}
            onRefresh={onRefresh}
            readOnly={readOnly}
            maskPrivateData={maskPrivateData}
          />
        ))}
      </div>

      {/* ── Desktop table (md and above) ── */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-left">
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Member</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Balance</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Tickets</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Today's Chores</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {members.map((m) => (
              <DashboardRow
                key={m.id}
                member={m}
                onRefresh={onRefresh}
                readOnly={readOnly}
                maskPrivateData={maskPrivateData}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
