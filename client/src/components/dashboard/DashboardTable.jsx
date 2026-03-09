import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBroom, faCrown } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { useFamilySettings } from '../../context/FamilySettingsContext.jsx';
import Avatar from '../shared/Avatar.jsx';
import { IconDisplay } from '../shared/IconPicker.jsx';
import QuickTicketAdjust from './QuickTicketAdjust.jsx';
import QuickBankAdjust from './QuickBankAdjust.jsx';
import LastActivityCell from './LastActivityCell.jsx';
import DashboardRow from './DashboardRow.jsx';
import ProgressRing from './ProgressRing.jsx';
import { formatCents } from '../../utils/formatCents.js';

// Shift each RGB channel toward white by `amount` (0–255)
function lightenHex(hex, amount = 40) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (n >> 16)         + amount);
  const g = Math.min(255, ((n >> 8) & 0xff) + amount);
  const b = Math.min(255, (n & 0xff)        + amount);
  return `rgb(${r},${g},${b})`;
}

// Shift each RGB channel toward black by `amount` (0–255)
function darkenHex(hex, amount = 50) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (n >> 16)         - amount);
  const g = Math.max(0, ((n >> 8) & 0xff) - amount);
  const b = Math.max(0, (n & 0xff)        - amount);
  return `rgb(${r},${g},${b})`;
}

// ── Mobile card ──────────────────────────────────────────────────────────────

function DashboardCard({ member, onRefresh, readOnly, maskPrivateData }) {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const { useBanking, useSets, useTickets } = useFamilySettings();
  const navigate = useNavigate();
  const isParent = user?.role === 'parent';
  const isOwnRow = member.id === user?.id;
  const showBalance = !maskPrivateData || member.showBalanceOnDashboard || isOwnRow;
  const isInteractiveKidRow = !readOnly && member.role === 'kid' && (isParent || isOwnRow);
  const nameClickable  = isInteractiveKidRow || (!readOnly && isOwnRow);
  const statsClickable = isInteractiveKidRow || (!readOnly && isOwnRow);

  const chorePct = member.choreTotal > 0 ? Math.round((member.choreDone / member.choreTotal) * 100) : 0;
  const choreDone = member.choreTotal > 0 && member.choreDone === member.choreTotal;

  // Dark mode: track=darker shade, progress=lighter shade of avatar color.
  // Light mode: track=light gray, progress=black.
  const ringTrackColor    = isDark ? darkenHex(member.avatarColor, 55) : lightenHex(member.avatarColor, 50);
  const ringProgressColor = isDark ? lightenHex(member.avatarColor, 80) : darkenHex(member.avatarColor, 55);
  const ringBgColor       = isDark ? darkenHex(member.avatarColor, 90) : lightenHex(member.avatarColor, 90);
  // Slightly darker shade for the filled (100%) ring in dark mode
  const ringDoneColor     = isDark ? lightenHex(member.avatarColor, 45) : darkenHex(member.avatarColor, 55);

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden transition-colors ${
        isOwnRow ? 'ring-2 ring-brand-400' : 'border border-gray-200 dark:border-gray-700'
      }`}
    >
      {/* ── Colored header banner ── */}
      <div
        className={`px-4 py-4 flex items-center gap-3 ${nameClickable ? 'cursor-pointer' : ''}`}
        style={{ backgroundColor: member.avatarColor }}
        onClick={nameClickable ? () => navigate(`/kid/${member.id}`) : undefined}
      >
        {/* Avatar — slightly lighter than header so it stands out */}
        <Avatar name={member.name} color={lightenHex(member.avatarColor)} emoji={member.avatarEmoji} size="lg" />

        {/* Name + role */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white leading-tight drop-shadow-sm">{member.name}</p>
          <p className="text-xs text-white/70 capitalize">{member.role}</p>
        </div>

        {/* Right side: progress circles */}
        {(member.role === 'kid' || (member.choresEnabled && member.choreTotal > 0)) && (
        <div className="flex items-center gap-1 shrink-0">
          {/* Chore ring */}
          <div className="rounded-full">
            <ProgressRing
              pct={chorePct}
              done={choreDone}
              size={56}
              trackColor={ringTrackColor}
              progressColor={choreDone ? ringDoneColor : ringProgressColor}
              bgColor={choreDone ? ringDoneColor : ringBgColor}
              title={`Chores: ${member.choreDone}/${member.choreTotal}`}
              onClick={(isInteractiveKidRow || (isOwnRow && member.choresEnabled)) ? (e) => { e.stopPropagation(); navigate(`/chores/${member.id}`); } : undefined}
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
                    trackColor={ringTrackColor}
                    progressColor={pct === 100 ? ringDoneColor : ringProgressColor}
                    bgColor={pct === 100 ? ringDoneColor : ringBgColor}
                    title={ts.name}
                    onClick={isInteractiveKidRow ? (e) => { e.stopPropagation(); navigate(`/tasks/${member.id}`); } : undefined}
                  >
                    <IconDisplay value={ts.emoji} fallback="📋" />
                  </ProgressRing>
                );
              })}
            </div>
          )}
        </div>
        )}
      </div>

      {/* ── Stats rows ── */}
      <div className="p-4">
        <div className="mb-3 pt-1 pb-3 border-b border-gray-100 dark:border-gray-700">
        {/* Row 1: Balance + Tickets + Trophies side by side */}
        <div className={`grid gap-1 ${
          (member.role === 'kid' || member.choresEnabled)
            ? { 3: 'grid-cols-3', 2: 'grid-cols-2', 1: 'grid-cols-1' }[[useBanking, useTickets, true].filter(Boolean).length]
            : { 2: 'grid-cols-2', 1: 'grid-cols-1', 0: 'grid-cols-1' }[[useBanking, useTickets].filter(Boolean).length]
        }`}>
          {/* Balance → Bank */}
          {useBanking && (
            <div className="text-center">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Balance</p>
              <div className="flex items-center justify-center gap-1.5">
                <p
                  className={`text-xl font-mono font-semibold text-gray-800 dark:text-gray-200 ${statsClickable ? 'cursor-pointer hover:text-brand-600' : ''}`}
                  onClick={statsClickable ? () => navigate(`/bank/${member.id}`) : undefined}
                >
                  {member.role === 'parent'
                    ? <span className="text-gray-400 dark:text-gray-500">—</span>
                    : showBalance
                      ? formatCents(member.mainBalanceCents)
                      : <span className="text-gray-400 dark:text-gray-500 tracking-widest text-base">—</span>
                  }
                </p>
                {!readOnly && isParent && member.role === 'kid' && (
                  <QuickBankAdjust userId={member.id} onDone={onRefresh} large />
                )}
              </div>
            </div>
          )}

          {/* Tickets → Tickets page */}
          {useTickets && (
            <div className="text-center">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Tickets</p>
              <div className="flex items-center justify-center gap-1.5">
                <p
                  className={`text-xl font-semibold text-gray-800 dark:text-gray-200 ${statsClickable ? 'cursor-pointer hover:text-brand-600' : ''}`}
                  onClick={statsClickable ? () => navigate(`/tickets/${member.id}`) : undefined}
                >
                  {member.ticketBalance} 🎟
                </p>
                {!readOnly && isParent && member.role === 'kid' && (
                  <QuickTicketAdjust userId={member.id} ticketBalance={member.ticketBalance} onDone={onRefresh} large />
                )}
              </div>
            </div>
          )}

          {/* Trophies → Trophies page */}
          {(member.role === 'kid' || member.choresEnabled) && (
            <div className="text-center">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Trophies</p>
              <p
                className={`text-xl font-semibold text-amber-500 dark:text-amber-400 ${statsClickable ? 'cursor-pointer hover:text-amber-600' : ''}`}
                onClick={statsClickable ? () => navigate(`/trophies/${member.id}`) : undefined}
              >
                🏆 {member.trophyCount}
              </p>
            </div>
          )}
        </div>

        </div>

        {/* Last activity */}
        {member.lastActivityDisplay && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {member.lastActivityDisplay}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Table + cards ─────────────────────────────────────────────────────────────

export default function DashboardTable({ members, onRefresh, readOnly = false, maskPrivateData = false }) {
  const { useBanking, useSets, useTickets } = useFamilySettings();
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
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 text-left">
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap w-px">Member</th>
              {useBanking && <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center whitespace-nowrap w-px">Balance</th>}
              {useTickets && <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center whitespace-nowrap w-px">Tickets</th>}
              <th className="px-2 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center whitespace-nowrap w-px">🏆</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap w-px">Progress</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
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
