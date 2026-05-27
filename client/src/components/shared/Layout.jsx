import { useState, useEffect, useCallback } from 'react';
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHouse, faTrophy, faTachographDigital, faBroom,
  faPiggyBank, faTicket, faUsers, faScroll, faRightFromBracket,
  faMedal, faClipboardCheck, faGear, faInbox, faMoneyBillWave, faPeopleRoof, faShieldHalved,
  faArrowsRotate, faRocket, faAnglesLeft, faAnglesRight,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { useFamilySettings } from '../../context/FamilySettingsContext.jsx';
import Avatar from './Avatar.jsx';
import EmojiPicker from './EmojiPicker.jsx';
import { familyApi } from '../../api/family.api.js';
import { overviewApi } from '../../api/overview.api.js';
import { taskSetsApi } from '../../api/taskSets.api.js';
import { accountsApi } from '../../api/accounts.api.js';

import { formatCents } from '../../utils/formatCents.js';
import InstallPrompt from './InstallPrompt.jsx';
import QuickActionsFab from './QuickActionsFab.jsx';
import useScrollLock from '../../hooks/useScrollLock.js';
import useSyncStatus from '../../offline/hooks/useSyncStatus.js';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../offline/db.js';

function HamburgerIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export default function Layout() {
  const { user, logout, patchUser } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { useBanking, useSets, useTickets, useBadges, choresLabel, setsStepsLabel } = useFamilySettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  // Desktop sidebar collapse — persisted across sessions. Collapsed shows
  // only the icons so the kid can still navigate without the full panel
  // eating space on wider work-area views.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem('sidebarCollapsed') === '1';
  });
  useEffect(() => {
    try { localStorage.setItem('sidebarCollapsed', sidebarCollapsed ? '1' : '0'); } catch {}
  }, [sidebarCollapsed]);
  useScrollLock(bottomPanelOpen);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [defaultMemberId, setDefaultMemberId] = useState(null);
  const [claudeAccess, setClaudeAccess] = useState(false);
  const [kidStats, setKidStats] = useState(null);
  const { isOnline, pendingCount } = useSyncStatus();

  // Reactive pending deposit count from Dexie (works offline)
  const dexiePendingDepositCount = useLiveQuery(
    () => user?.role === 'kid' ? db.pendingDeposits.where('userId').equals(user.id).count() : 0,
    [user?.role, user?.id],
    0,
  );

  // Fetch nav badge stats for kids; re-fetch on 'kid-stats-updated' event
  const refreshKidStats = useCallback(() => {
    if (user?.role !== 'kid') return;
    Promise.all([
      overviewApi.getOverview(user.id),
      taskSetsApi.getUserTaskSets(user.id),
      accountsApi.getPendingDeposits(user.id),
    ]).then(([overview, taskData, pdData]) => {
      const mainAccount = overview.accounts.find((a) => a.type === 'main');
      setKidStats({
        choresRemaining:        overview.choreProgressToday.total - overview.choreProgressToday.done,
        mainBalanceCents:       mainAccount?.balance_cents ?? 0,
        ticketBalance:          overview.ticketBalance,
        taskSetsCount:          taskData.taskSets.filter(
          (ts) => !(ts.step_count > 0 && ts.completed_count === ts.step_count)
        ).length,
        completedTaskSetsCount: taskData.taskSets.filter(
          (ts) => ts.type === 'One-Off' && ts.step_count > 0 && ts.completed_count === ts.step_count
            && ts.completion_status !== 'pending' && !(ts.pending_step_count > 0)
        ).length + (taskData.hasKingOfCrowns ? 1 : 0),
        pendingDepositCount:    (pdData.pending_deposits || []).length,
      });
    }).catch(() => {});
  }, [user?.role, user?.id]);

  useEffect(() => {
    refreshKidStats();
    window.addEventListener('kid-stats-updated', refreshKidStats);
    return () => window.removeEventListener('kid-stats-updated', refreshKidStats);
  }, [refreshKidStats]);

  // Reactive inbox count from Dexie cache (works offline, updated by prefetch/sync)
  const inboxCache = useLiveQuery(
    () => user?.role === 'parent' && user?.familyId ? db.inboxCache.get(user.familyId) : undefined,
    [user?.role, user?.familyId],
  );
  const inboxCount = (inboxCache?.kids || []).reduce(
    (sum, k) => sum + k.chores.length + k.steps.length + (k.setCompletions || []).length,
    0,
  );

  // Check claude_access for kids (parents get it in the fetch below)
  useEffect(() => {
    if (user?.role !== 'kid') return;
    familyApi.getFamily().then((data) => {
      if (data.family?.claude_access) setClaudeAccess(true);
    }).catch(() => {});
  }, [user?.role, user?.familyId]);

  // Fetch default member for "Individual Pages" nav links
  useEffect(() => {
    if (user?.role !== 'parent') return;
    familyApi.getFamily().then((data) => {
      if (data.family?.claude_access) setClaudeAccess(true);
      const members = data.members || [];
      // If logged-in parent has chores_enabled, default to their own ID
      const self = members.find((m) => m.id === user.id);
      if (self && self.chores_enabled) {
        setDefaultMemberId(self.id);
        return;
      }
      // Otherwise, default to first active kid
      const sorted = members
        .filter((m) => m.role === 'kid' && m.is_active !== 0)
        .sort((a, b) => {
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
          return a.name.localeCompare(b.name);
        });
      if (sorted.length > 0) setDefaultMemberId(sorted[0].id);
    }).catch(() => {});
  }, [user?.role, user?.id]);

  // Sync defaultMemberId from URL when parent visits any individual page
  useEffect(() => {
    if (user?.role !== 'parent') return;
    const match = location.pathname.match(/^\/(kid|chores|bank|tickets|tasks|trophies)\/(\d+)/);
    if (match) {
      const id = parseInt(match[2], 10);
      if (id !== defaultMemberId) setDefaultMemberId(id);
    }
  }, [location.pathname, user?.role, defaultMemberId]);

  const handleEmojiPick = async (emoji) => {
    if (!user) return;
    try {
      await familyApi.updateEmoji(user.id, emoji);
      patchUser({ avatarEmoji: emoji });
    } catch {
      // silently ignore — avatar change is non-critical
    }
  };

  const handleColorPick = async (color) => {
    if (!user) return;
    patchUser({ avatarColor: color }); // optimistic
    try {
      await familyApi.updateColor(user.id, color);
    } catch {
      // silently ignore — avatar change is non-critical
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const close = () => setBottomPanelOpen(false);

  // Prevent pull-to-refresh while the bottom panel is open
  useEffect(() => {
    if (!bottomPanelOpen) return;
    const prev = document.body.style.overscrollBehavior;
    document.body.style.overscrollBehavior = 'none';
    return () => { document.body.style.overscrollBehavior = prev; };
  }, [bottomPanelOpen]);


  // NavLink base class. When the sidebar is collapsed (icon-only), center
  // the icon in the link instead of left-aligning. The transition-colors
  // works at any width.
  const navAlignClass = sidebarCollapsed ? 'justify-center px-2' : 'px-3';
  const navClass = ({ isActive }) =>
    `flex items-center gap-2 ${navAlignClass} py-2 rounded-md transition-colors ${
      isActive
        ? 'bg-brand-50 text-brand-700 font-medium dark:bg-gray-700 dark:text-brand-500'
        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
    }`;

  // Active class for kid-path links that match any /:base/:id
  const kidPathClass = (base) =>
    `flex items-center gap-2 ${navAlignClass} py-2 rounded-md transition-colors ${
      location.pathname.startsWith(base + '/')
        ? 'bg-brand-50 text-brand-700 font-medium dark:bg-gray-700 dark:text-brand-500'
        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
    }`;

  // Helpers — wrap a text label so it can be hidden by the sidebar's
  // [&_[data-nav-label]]:hidden when collapsed. Section dividers use
  // the same data-nav-label so the whole row disappears.
  const Lbl  = ({ children }) => <span data-nav-label>{children}</span>;
  const Badge = ({ className, children }) => (
    <span data-nav-badge className={className}>{children}</span>
  );
  const SectionHeader = ({ children }) => (
    <div data-nav-label className="pt-2 pb-1 px-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
      {children}
    </div>
  );

  const Nav = () => (
    <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 space-y-1 text-sm">
      <NavLink to="/dashboard" className={navClass} onClick={close} title="Dashboard">
        <FontAwesomeIcon icon={faHouse} className="w-4 shrink-0" />
        <Lbl>Dashboard</Lbl>
      </NavLink>

      {user?.role === 'parent' && (
        <>
          <NavLink to="/inbox" className={navClass} onClick={close} title="Inbox">
            <FontAwesomeIcon icon={faInbox} className="w-4 shrink-0" />
            <Lbl>Inbox</Lbl>
            {inboxCount > 0 && (
              <Badge className="ml-auto text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full leading-tight bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400">
                {inboxCount}
              </Badge>
            )}
          </NavLink>
          {claudeAccess && (
            <NavLink to="/code-apps" className={navClass} onClick={close} title="Apps">
              <FontAwesomeIcon icon={faRocket} className="w-4 shrink-0" />
              <Lbl>Apps</Lbl>
            </NavLink>
          )}

          {defaultMemberId && (
            <>
              <SectionHeader>Individual Pages</SectionHeader>
              <NavLink to={`/kid/${defaultMemberId}`} className={() => kidPathClass('/kid')} onClick={close} title="Overview">
                <FontAwesomeIcon icon={faTachographDigital} className="w-4 shrink-0" />
                <Lbl>Overview</Lbl>
              </NavLink>
              <NavLink to={`/chores/${defaultMemberId}`} className={() => kidPathClass('/chores')} onClick={close} title={choresLabel}>
                <FontAwesomeIcon icon={faBroom} className="w-4 shrink-0" />
                <Lbl>{choresLabel}</Lbl>
              </NavLink>
              {useBanking && (
                <NavLink to={`/bank/${defaultMemberId}`} className={() => kidPathClass('/bank')} onClick={close} title="Bank">
                  <FontAwesomeIcon icon={faPiggyBank} className="w-4 shrink-0" />
                  <Lbl>Bank</Lbl>
                </NavLink>
              )}
              {useTickets && (
                <NavLink to={`/tickets/${defaultMemberId}`} className={() => kidPathClass('/tickets')} onClick={close} title="Tickets">
                  <FontAwesomeIcon icon={faTicket} className="w-4 shrink-0" />
                  <Lbl>Tickets</Lbl>
                </NavLink>
              )}
              {useSets && (
                <NavLink to={`/tasks/${defaultMemberId}`} className={() => kidPathClass('/tasks')} onClick={close} title={setsStepsLabel}>
                  <FontAwesomeIcon icon={faMedal} className="w-4 shrink-0" />
                  <Lbl>{setsStepsLabel}</Lbl>
                </NavLink>
              )}
              <NavLink to={`/trophies/${defaultMemberId}`} className={() => kidPathClass('/trophies')} onClick={close} title="Trophies">
                <FontAwesomeIcon icon={faTrophy} className="w-4 shrink-0" />
                <Lbl>Trophies</Lbl>
              </NavLink>
            </>
          )}

          <SectionHeader>Settings</SectionHeader>
          <NavLink to="/settings" end className={navClass} onClick={close} title="Settings">
            <FontAwesomeIcon icon={faGear} className="w-4 shrink-0" />
            <Lbl>Settings</Lbl>
          </NavLink>
          <NavLink to="/settings/users" className={navClass} onClick={close} title={`Family & ${choresLabel}`}>
            <FontAwesomeIcon icon={faUsers} className="w-4 shrink-0" />
            <Lbl>Family &amp; {choresLabel}</Lbl>
          </NavLink>
          {useSets && (
            <NavLink to="/settings/tasks" className={navClass} onClick={close} title="Set Management">
              <FontAwesomeIcon icon={faClipboardCheck} className="w-4 shrink-0" />
              <Lbl>Set Management</Lbl>
            </NavLink>
          )}
          {useBadges && (
            <NavLink to="/settings/badges" className={navClass} onClick={close} title="Badge Library">
              <FontAwesomeIcon icon={faShieldHalved} className="w-4 shrink-0" />
              <Lbl>Badge Library</Lbl>
            </NavLink>
          )}
          {useTickets && (
            <NavLink to="/rewards" className={navClass} onClick={close} title="Rewards">
              <FontAwesomeIcon icon={faTrophy} className="w-4 shrink-0" />
              <Lbl>Rewards</Lbl>
            </NavLink>
          )}
          <NavLink to="/settings/turns" className={navClass} onClick={close} title="Turns">
            <FontAwesomeIcon icon={faArrowsRotate} className="w-4 shrink-0" />
            <Lbl>Turns</Lbl>
          </NavLink>
          <NavLink to="/family-activity" className={navClass} onClick={close} title="Family Activity">
            <FontAwesomeIcon icon={faScroll} className="w-4 shrink-0" />
            <Lbl>Family Activity</Lbl>
          </NavLink>

          {user?.isAdmin && (
            <>
              <SectionHeader>Admin</SectionHeader>
              <NavLink to="/admin" className={navClass} onClick={close} title="Admin Dashboard">
                <FontAwesomeIcon icon={faShieldHalved} className="w-4 shrink-0" />
                <Lbl>Admin Dashboard</Lbl>
              </NavLink>
            </>
          )}
        </>
      )}

      {user?.role === 'kid' && (
        <>
          {claudeAccess && (
            <NavLink to="/code-apps" className={navClass} onClick={close} title="Apps">
              <FontAwesomeIcon icon={faRocket} className="w-4 shrink-0" />
              <Lbl>Apps</Lbl>
            </NavLink>
          )}
          <NavLink to={`/kid/${user.id}`} className={navClass} onClick={close} title="My Overview">
            <FontAwesomeIcon icon={faTachographDigital} className="w-4 shrink-0" />
            <Lbl>My Overview</Lbl>
          </NavLink>
          <NavLink to={`/chores/${user.id}`} className={navClass} onClick={close} title={`My ${choresLabel}`}>
            <FontAwesomeIcon icon={faBroom} className="w-4 shrink-0" />
            <Lbl>My {choresLabel}</Lbl>
            {kidStats && (
              <Badge className={`ml-auto text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full leading-tight ${
                kidStats.choresRemaining > 0
                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-gray-400'
                  : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-gray-400'
              }`}>
                {kidStats.choresRemaining > 0 ? kidStats.choresRemaining : '✓'}
              </Badge>
            )}
          </NavLink>
          {useBanking && (
            <NavLink to={`/bank/${user.id}`} className={navClass} onClick={close} title="My Bank">
              <FontAwesomeIcon icon={faPiggyBank} className="w-4 shrink-0" />
              <Lbl>My Bank</Lbl>
              {kidStats && (
                <Badge className="ml-auto text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full leading-tight bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                  {formatCents(kidStats.mainBalanceCents)}
                </Badge>
              )}
            </NavLink>
          )}
          {useTickets && (
            <NavLink to={`/tickets/${user.id}`} className={navClass} onClick={close} title="My Tickets">
              <FontAwesomeIcon icon={faTicket} className="w-4 shrink-0" />
              <Lbl>My Tickets</Lbl>
              {kidStats && (
                <Badge className="ml-auto text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full leading-tight bg-brand-50 dark:bg-brand-500/20 text-brand-700 dark:text-gray-400">
                  {kidStats.ticketBalance}
                </Badge>
              )}
            </NavLink>
          )}
          {useBadges && (
            <NavLink to={`/badges/${user.id}`} className={navClass} onClick={close} title="My Badges">
              <FontAwesomeIcon icon={faShieldHalved} className="w-4 shrink-0" />
              <Lbl>My Badges</Lbl>
            </NavLink>
          )}
          {useSets && (
            <NavLink to={`/tasks/${user.id}`} className={navClass} onClick={close} title="My Sets">
              <FontAwesomeIcon icon={faMedal} className="w-4 shrink-0" />
              <Lbl>My Sets</Lbl>
              {kidStats && (
                <Badge className="ml-auto text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full leading-tight bg-brand-50 dark:bg-brand-500/20 text-brand-700 dark:text-gray-400">
                  {kidStats.taskSetsCount}
                </Badge>
              )}
            </NavLink>
          )}
          <NavLink to={`/trophies/${user.id}`} className={navClass} onClick={close} title="My Trophies">
            <FontAwesomeIcon icon={faTrophy} className="w-4 shrink-0" />
            <Lbl>My Trophies</Lbl>
            {kidStats && kidStats.completedTaskSetsCount > 0 && (
              <Badge className="ml-auto text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full leading-tight bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-gray-400">
                {kidStats.completedTaskSetsCount}
              </Badge>
            )}
          </NavLink>
          {useTickets && (
            <NavLink to="/rewards" className={navClass} onClick={close} title="Rewards">
              <FontAwesomeIcon icon={faTrophy} className="w-4 shrink-0" />
              <Lbl>Rewards</Lbl>
            </NavLink>
          )}
        </>
      )}
    </nav>
  );

  return (
    <div className="flex h-dvh bg-gray-50 dark:bg-gray-900">

      {/* ── Bottom panel backdrop (mobile) ── */}
      {bottomPanelOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar (desktop only) ──
          When collapsed: width drops to 14 (icons only). The
          [&_[data-nav-label]]:hidden selector hides every <span data-nav-label>
          inside the aside without a per-link edit, and [&_[data-nav-badge]]:hidden
          drops the inline count chips so the icon row stays clean. */}
      <aside
        className={`hidden lg:flex lg:flex-col lg:shrink-0 bg-white dark:bg-gray-800 border-r border-gray-100 dark:border-gray-700 shadow-sm transition-[width] duration-200 ${
          sidebarCollapsed
            ? 'lg:w-14 [&_[data-nav-label]]:hidden [&_[data-nav-badge]]:hidden'
            : 'lg:w-56'
        }`}
      >
        {/* Sidebar header — title or just the icon when collapsed, plus a
            toggle button on the right (or stacked when collapsed). */}
        <div className={`border-b border-gray-100 dark:border-gray-700 ${sidebarCollapsed ? 'px-2 py-3 flex flex-col items-center gap-2' : 'px-4 py-5 flex items-center justify-between'}`}>
          <Link
            to="/dashboard"
            className={`font-bold text-brand-600 hover:text-brand-700 ${sidebarCollapsed ? 'text-xl' : 'text-lg'}`}
            title={sidebarCollapsed ? 'Family Dash · Dashboard' : undefined}
          >
            <FontAwesomeIcon icon={faPeopleRoof} className={sidebarCollapsed ? '' : 'mr-2'} />
            <span data-nav-label>Family Dash</span>
          </Link>
          {!isOnline && (
            <span data-nav-badge className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              pendingCount > 0
                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
            }`}>
              Offline{pendingCount > 0 ? ` · ${pendingCount}` : ''}
            </span>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="p-1 rounded-md text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <FontAwesomeIcon icon={sidebarCollapsed ? faAnglesRight : faAnglesLeft} className="text-sm" />
          </button>
        </div>

        <Nav />

        {/* Pending deposit banner (kid only) */}
        {(kidStats?.pendingDepositCount || dexiePendingDepositCount) > 0 && (
          <button
            onClick={() => navigate(`/bank/${user.id}`, { state: { openReceive: true } })}
            className={`mx-3 mb-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-semibold hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors ${sidebarCollapsed ? 'justify-center' : ''}`}
            title="Money to receive"
          >
            <FontAwesomeIcon icon={faMoneyBillWave} className="text-[11px]" />
            <span data-nav-label>Money to receive!</span>
          </button>
        )}

        {/* User info + theme toggle + logout — stacks when collapsed so the
            avatar + icons keep the same touch targets. */}
        <div className={`border-t border-gray-100 dark:border-gray-700 ${sidebarCollapsed ? 'px-2 py-3 flex flex-col items-center gap-2' : 'px-4 py-4 flex items-center gap-3'}`}>
          <button
            type="button"
            onClick={() => setEmojiOpen(true)}
            className="flex-shrink-0 rounded-full hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-brand-400"
            title="Change avatar"
          >
            <Avatar name={user?.name || '?'} color={user?.avatarColor || '#6366f1'} emoji={user?.avatarEmoji} size="sm" />
          </button>
          <div data-nav-label className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 capitalize">{user?.role}</p>
          </div>
          <button
            onClick={toggleTheme}
            className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
          {user?.role !== 'kid' && (
            <button
              onClick={handleLogout}
              className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              title="Sign out"
            >
              <FontAwesomeIcon icon={faRightFromBracket} />
            </button>
          )}
        </div>
      </aside>

      {/* Emoji picker */}
      <EmojiPicker
        open={emojiOpen}
        onClose={() => setEmojiOpen(false)}
        onPickEmoji={handleEmojiPick}
        onPickColor={handleColorPick}
        currentEmoji={user?.avatarEmoji}
        currentColor={user?.avatarColor}
        previewName={user?.name}
      />

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">

        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3 shadow-sm" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <button
            onClick={() => setBottomPanelOpen((o) => !o)}
            className="relative p-1 -ml-1 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
            aria-label="Open navigation menu"
          >
            <HamburgerIcon />
            {((user?.role === 'parent' && inboxCount > 0) || (user?.role === 'kid' && (kidStats?.pendingDepositCount || dexiePendingDepositCount) > 0)) && (
              <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-red-500 dark:bg-red-400 border-2 border-white dark:border-gray-800" />
            )}
          </button>
          <Link to="/dashboard" className="font-bold text-brand-600 text-base hover:text-brand-700"><FontAwesomeIcon icon={faPeopleRoof} className="mr-2" />Family Dash</Link>
          <div className="ml-auto flex items-center gap-2">
            {!isOnline && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                pendingCount > 0
                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}>
                Offline{pendingCount > 0 ? ` · ${pendingCount}` : ''}
              </span>
            )}
            {(kidStats?.pendingDepositCount || dexiePendingDepositCount) > 0 && (
              <button
                onClick={() => navigate(`/bank/${user.id}`, { state: { openReceive: true } })}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400 dark:bg-amber-500 text-amber-900 dark:text-amber-950 text-[10px] font-bold shadow-sm hover:bg-amber-300 dark:hover:bg-amber-400 transition-colors"
              >
                <FontAwesomeIcon icon={faMoneyBillWave} className="text-[9px]" />
                Receive $!
              </button>
            )}
            <button
              type="button"
              onClick={() => setEmojiOpen(true)}
              className="rounded-full hover:opacity-80 transition-opacity"
              title="Change avatar"
            >
              <Avatar name={user?.name || '?'} color={user?.avatarColor || '#6366f1'} emoji={user?.avatarEmoji} size="sm" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className={`flex-1 overflow-x-hidden overflow-y-auto p-4 lg:p-6 ${bottomPanelOpen ? 'overflow-hidden' : ''}`} style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </main>

        <InstallPrompt />
        <QuickActionsFab />

        {/* ── Slide-in side panel (mobile only) ── */}
        <div
          className="lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 shadow-2xl flex flex-col"
          style={{
            transform: bottomPanelOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 300ms ease-in-out',
          }}
        >
          {/* Panel header */}
          <div className="px-4 py-5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between" style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}>
            <Link to="/dashboard" onClick={close} className="text-lg font-bold text-brand-600 hover:text-brand-700">Family Dashboard</Link>
            <button
              onClick={close}
              className="p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Close menu"
            >
              <CloseIcon />
            </button>
          </div>

          {/* Nav links */}
          <Nav />

          {/* Pending deposit banner (kid only) */}
          {(kidStats?.pendingDepositCount || dexiePendingDepositCount) > 0 && (
            <button
              onClick={() => { close(); navigate(`/bank/${user.id}`, { state: { openReceive: true } }); }}
              className="mx-3 mb-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-semibold hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors"
            >
              <FontAwesomeIcon icon={faMoneyBillWave} className="text-[11px]" />
              Money to receive!
            </button>
          )}

          {/* User info + theme toggle + logout (matches desktop sidebar) */}
          <div className="px-4 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center gap-3">
            <button
              type="button"
              onClick={() => { setEmojiOpen(true); close(); }}
              className="flex-shrink-0 rounded-full hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-brand-400"
              title="Change avatar"
            >
              <Avatar name={user?.name || '?'} color={user?.avatarColor || '#6366f1'} emoji={user?.avatarEmoji} size="sm" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 capitalize">{user?.role}</p>
            </div>
            <button
              onClick={toggleTheme}
              className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
            {user?.role !== 'kid' && (
              <button
                onClick={() => { close(); handleLogout(); }}
                className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                title="Sign out"
              >
                <FontAwesomeIcon icon={faRightFromBracket} />
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
