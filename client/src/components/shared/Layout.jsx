import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHouse, faTrophy, faTachographDigital, faBroom,
  faPiggyBank, faTicket, faUsers, faScroll, faRightFromBracket,
  faMedal, faClipboardCheck, faGear, faInbox, faMoneyBillWave, faPeopleRoof, faShieldHalved,
  faArrowsRotate, faRocket, faAnglesLeft, faAnglesRight, faEllipsis, faXmark, faPlus,
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
import ErrorBoundary from './ErrorBoundary.jsx';
import useScrollLock from '../../hooks/useScrollLock.js';
import useOverscrollGuard from '../../hooks/useOverscrollGuard.js';
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

  // Below the lg breakpoint we always show the sidebar in its minimized
  // (icon-only) form instead of the old hamburger + drawer pattern. The
  // user's saved `sidebarCollapsed` preference still applies on desktop.
  const [isNarrow, setIsNarrow] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1023.98px)').matches
  ));
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 1023.98px)');
    const handler = (e) => setIsNarrow(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const effectiveCollapsed = isNarrow || sidebarCollapsed;

  // Mobile bottom-bar "More" sheet — overflow nav items + profile/theme/
  // sign-out. Closes on navigation, item-tap, or backdrop tap.
  const [moreOpen, setMoreOpen] = useState(false);
  // Quick-actions modal (the old FAB lives on as a controlled modal now,
  // with trigger buttons in the desktop sidebar + mobile More sheet).
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);

  // Custom hover tooltip for the collapsed sidebar — appears instantly (no
  // 500ms native dwell) and is a bit larger than the OS tooltip. Implemented
  // via event delegation on the aside + direct DOM mutation on a tooltip
  // element (no React state) because the inner Nav component is recreated on
  // every Layout render — using setState here would force NavLinks to remount
  // mid-click, breaking real mouse clicks (mousedown + mouseup land on
  // different DOM nodes, so the browser swallows the click).
  const asideRef = useRef(null);
  const tipElRef = useRef(null);
  const tipTargetRef = useRef(null);

  const showTip = (el) => {
    const tipEl = tipElRef.current;
    if (!tipEl) return;
    const label = el.dataset.tipLabel || el.getAttribute('title');
    if (!label) {
      tipEl.style.display = 'none';
      tipTargetRef.current = null;
      return;
    }
    const rect = el.getBoundingClientRect();
    tipEl.textContent = label;
    tipEl.style.top = `${rect.top + rect.height / 2}px`;
    tipEl.style.left = `${rect.right + 10}px`;
    // Clear the inline `display: none` so the Tailwind `hidden lg:block`
    // class controls visibility — keeps the tooltip off mobile/narrow widths
    // even after a prior desktop hover.
    tipEl.style.display = '';
    tipTargetRef.current = el;
  };

  const hideTip = () => {
    if (tipElRef.current) tipElRef.current.style.display = 'none';
    tipTargetRef.current = null;
  };

  const handleSidebarMouseOver = (e) => {
    if (!effectiveCollapsed) return;
    const el = e.target.closest('[data-tip-label], a[title], button[title]');
    if (!el || !asideRef.current?.contains(el)) return;
    if (tipTargetRef.current === el) return;
    showTip(el);
  };

  const handleSidebarMouseOut = (e) => {
    if (!tipTargetRef.current) return;
    const related = e.relatedTarget;
    if (related && tipTargetRef.current.contains && tipTargetRef.current.contains(related)) return;
    hideTip();
  };

  useEffect(() => {
    if (!effectiveCollapsed) hideTip();
  }, [effectiveCollapsed]);

  // While the (lg+) sidebar is collapsed, suppress native `title` tooltips
  // inside the aside by moving them to `data-tip-label`. Use a
  // MutationObserver to keep re-stripping titles as React re-renders the
  // nav (the inner Nav component is recreated on every Layout render).
  // `isNarrow` is in the deps because the aside re-mounts when crossing
  // the lg breakpoint, and the ref points at a new node.
  useEffect(() => {
    const aside = asideRef.current;
    if (!aside || !effectiveCollapsed || isNarrow) return;
    const stripAll = () => {
      aside.querySelectorAll('[title]').forEach((el) => {
        const t = el.getAttribute('title');
        if (t) {
          el.dataset.tipLabel = t;
          el.removeAttribute('title');
        }
      });
    };
    stripAll();
    const obs = new MutationObserver(stripAll);
    obs.observe(aside, {
      attributes: true,
      attributeFilter: ['title'],
      subtree: true,
      childList: true,
    });
    return () => {
      obs.disconnect();
      aside.querySelectorAll('[data-tip-label]').forEach((el) => {
        el.setAttribute('title', el.dataset.tipLabel);
        delete el.dataset.tipLabel;
      });
    };
  }, [effectiveCollapsed, isNarrow]);
  useScrollLock(bottomPanelOpen);
  // Always-on overscroll guard: stops short app pages from reloading in
  // HappyWeb when a swipe has nothing to scroll. (useScrollLock applies the
  // same protection only while a modal is open.)
  useOverscrollGuard(true);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [defaultMemberId, setDefaultMemberId] = useState(null);
  // Apps nav shows when the family has Claude Code OR when there are repo-authored
  // Family Apps to launch (server/static-apps/) — the latter needs no Claude access.
  const [showAppsNav, setShowAppsNav] = useState(false);
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

  // Helper: pull the logged-in user's saved menubar_layout (JSON string in
  // the user row) and apply it to local state. Tolerates malformed JSON.
  const applyMenubarFromMember = (member) => {
    if (!member?.menubar_layout) return;
    try {
      const parsed = typeof member.menubar_layout === 'string'
        ? JSON.parse(member.menubar_layout)
        : member.menubar_layout;
      if (parsed && Array.isArray(parsed.primary)) {
        lastSavedRef.current = JSON.stringify(parsed.primary);
        setPrimaryKeys(parsed.primary);
      }
    } catch (_) { /* use defaults */ }
  };

  // Check claude_access for kids (parents get it in the fetch below)
  useEffect(() => {
    if (user?.role !== 'kid') return;
    familyApi.getFamily().then((data) => {
      if (data.family?.claude_access || data.familyAppsCount > 0) setShowAppsNav(true);
      applyMenubarFromMember((data.members || []).find((m) => m.id === user.id));
    }).catch(() => {});
  }, [user?.role, user?.familyId]);

  // Fetch default member for "Individual Pages" nav links
  useEffect(() => {
    if (user?.role !== 'parent') return;
    familyApi.getFamily().then((data) => {
      if (data.family?.claude_access || data.familyAppsCount > 0) setShowAppsNav(true);
      const members = data.members || [];
      applyMenubarFromMember(members.find((m) => m.id === user.id));
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


  // NavLink class factories — take `collapsed` so the same <Nav /> can render
  // icon-only-centered inside the desktop collapsed sidebar and full-width
  // left-aligned inside the mobile drawer.
  const makeNavClass = (collapsed) => {
    const align = collapsed ? 'justify-center px-2' : 'px-3';
    return ({ isActive }) =>
      `flex items-center gap-2 ${align} py-2 rounded-md transition-colors ${
        isActive
          ? 'bg-brand-50 text-brand-700 font-medium dark:bg-gray-700 dark:text-brand-500'
          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
      }`;
  };
  const makeKidPathClass = (collapsed) => (base) => {
    const align = collapsed ? 'justify-center px-2' : 'px-3';
    return `flex items-center gap-2 ${align} py-2 rounded-md transition-colors ${
      location.pathname.startsWith(base + '/')
        ? 'bg-brand-50 text-brand-700 font-medium dark:bg-gray-700 dark:text-brand-500'
        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
    }`;
  };

  // Helpers — wrap a text label so it can be hidden by the sidebar's
  // [&_[data-nav-label]]:hidden when collapsed. Section dividers use
  // the same data-nav-label so the whole row disappears.
  const Lbl  = ({ children }) => <span data-nav-label>{children}</span>;
  const Badge = ({ className, children }) => (
    <span data-nav-badge className={className}>{children}</span>
  );
  // When expanded, render the text section header. When collapsed, the
  // text is hidden (data-nav-label) and a horizontal rule (data-nav-divider)
  // takes its place so groups stay visually separated in icon-only mode.
  const SectionHeader = ({ children }) => (
    <>
      <div data-nav-label className="pt-2 pb-1 px-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
        {children}
      </div>
      <hr data-nav-divider className="hidden mx-2 !mt-3 !mb-3 border-gray-200 dark:border-gray-700" aria-hidden="true" />
    </>
  );

  const Nav = ({ collapsed = false, horizontal = false }) => {
  const navClass = makeNavClass(collapsed);
  const kidPathClass = makeKidPathClass(collapsed);
  return (
    <nav className={horizontal
      ? 'flex-1 min-w-0 overflow-x-auto overscroll-contain flex flex-row items-center gap-1 px-2 text-sm'
      // overflow-x-hidden: setting only overflow-y: auto turns overflow-x
      // into `auto` per CSS spec, which causes a spurious 1px horizontal
      // scrollbar when collapsed at w-14 (rounded pill / absolute badges
      // peek out by sub-pixel).
      : 'flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-4 space-y-1 text-sm'}>
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
          {showAppsNav && (
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
          {/* Quick-add — opens the same dialog as the old floating FAB.
              Sits at the bottom of the Settings group so it's always
              one click away regardless of which page you're on. */}
          <button
            type="button"
            onClick={() => { close(); setQuickActionsOpen(true); }}
            className={navClass({ isActive: false })}
            title="Quick add"
          >
            <FontAwesomeIcon icon={faPlus} className="w-4 shrink-0" />
            <Lbl>Add</Lbl>
          </button>

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
          {showAppsNav && (
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
          {useSets && (
            <NavLink to={`/tasks/${user.id}`} className={navClass} onClick={close} title={`My ${setsStepsLabel}`}>
              <FontAwesomeIcon icon={faMedal} className="w-4 shrink-0" />
              <Lbl>My {setsStepsLabel}</Lbl>
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
  };

  // ── Mobile bottom-bar items ──
  // Single ordered "all items" list, each tagged with a section. The
  // primary slots (4) are an array of keys — defaults below, but the user
  // can customize and we persist their choice. Whatever's not in primary
  // shows up in the More sheet, grouped by section (mirrors desktop nav).
  const { allMobileItems, defaultPrimaryKeys } = useMemo(() => {
    const all = [];
    let defaults = [];
    if (user?.role === 'parent') {
      all.push({ key: 'dashboard', icon: faHouse, label: 'Home', to: '/dashboard', section: 'main' });
      all.push({ key: 'inbox', icon: faInbox, label: 'Inbox', to: '/inbox', section: 'main', badge: inboxCount > 0 ? inboxCount : null });
      if (showAppsNav) all.push({ key: 'apps', icon: faRocket, label: 'Apps', to: '/code-apps', section: 'main' });
      if (defaultMemberId) {
        all.push({ key: 'overview', icon: faTachographDigital, label: 'Overview', to: `/kid/${defaultMemberId}`, section: 'individual' });
        all.push({ key: 'kid-chores', icon: faBroom, label: choresLabel, to: `/chores/${defaultMemberId}`, section: 'individual' });
        if (useBanking) all.push({ key: 'kid-bank', icon: faPiggyBank, label: 'Bank', to: `/bank/${defaultMemberId}`, section: 'individual' });
        if (useTickets) all.push({ key: 'kid-tickets', icon: faTicket, label: 'Tickets', to: `/tickets/${defaultMemberId}`, section: 'individual' });
        if (useSets) all.push({ key: 'kid-sets', icon: faMedal, label: setsStepsLabel, to: `/tasks/${defaultMemberId}`, section: 'individual' });
        all.push({ key: 'kid-trophies', icon: faTrophy, label: 'Trophies', to: `/trophies/${defaultMemberId}`, section: 'individual' });
      }
      all.push({ key: 'settings', icon: faGear, label: 'Settings', to: '/settings', section: 'settings' });
      all.push({ key: 'family', icon: faUsers, label: `Family & ${choresLabel}`, to: '/settings/users', section: 'settings' });
      if (useSets) all.push({ key: 'set-mgmt', icon: faClipboardCheck, label: 'Set Mgmt', to: '/settings/tasks', section: 'settings' });
      if (useBadges) all.push({ key: 'badge-lib', icon: faShieldHalved, label: 'Badge Library', to: '/settings/badges', section: 'settings' });
      if (useTickets) all.push({ key: 'rewards', icon: faTrophy, label: 'Rewards', to: '/rewards', section: 'settings' });
      all.push({ key: 'turns', icon: faArrowsRotate, label: 'Turns', to: '/settings/turns', section: 'settings' });
      all.push({ key: 'activity', icon: faScroll, label: 'Activity', to: '/family-activity', section: 'settings' });
      // Quick-add — non-nav action item. Opens the QuickActions modal.
      // Sits at the bottom of the Settings group, matching the desktop
      // sidebar placement.
      all.push({ key: 'add', icon: faPlus, label: 'Add', action: 'quick-add', section: 'settings' });
      if (user?.isAdmin) all.push({ key: 'admin', icon: faShieldHalved, label: 'Admin', to: '/admin', section: 'admin' });
      defaults = ['dashboard', 'inbox', defaultMemberId ? 'overview' : null, 'activity'].filter(Boolean);
    } else if (user?.role === 'kid') {
      all.push({ key: 'overview', icon: faTachographDigital, label: 'Home', to: `/kid/${user.id}`, section: 'main' });
      all.push({
        key: 'chores', icon: faBroom, label: choresLabel, to: `/chores/${user.id}`, section: 'main',
        badge: kidStats?.choresRemaining > 0 ? kidStats.choresRemaining : null,
      });
      if (showAppsNav) all.push({ key: 'apps', icon: faRocket, label: 'Apps', to: '/code-apps', section: 'main' });
      if (useBanking) all.push({ key: 'bank', icon: faPiggyBank, label: 'Bank', to: `/bank/${user.id}`, section: 'main' });
      if (useTickets) all.push({ key: 'tickets', icon: faTicket, label: 'Tickets', to: `/tickets/${user.id}`, section: 'main', badge: kidStats?.ticketBalance });
      if (useSets) all.push({ key: 'sets', icon: faMedal, label: `My ${setsStepsLabel}`, to: `/tasks/${user.id}`, section: 'main' });
      all.push({ key: 'trophies', icon: faTrophy, label: 'Trophies', to: `/trophies/${user.id}`, section: 'main' });
      if (useTickets) all.push({ key: 'rewards', icon: faTrophy, label: 'Rewards', to: '/rewards', section: 'main' });
      defaults = ['overview', 'chores', useTickets ? 'tickets' : (useBanking ? 'bank' : 'trophies'), 'trophies'].filter((k, i, arr) => k && arr.indexOf(k) === i).slice(0, 4);
    }
    return { allMobileItems: all, defaultPrimaryKeys: defaults };
  }, [user, defaultMemberId, showAppsNav, inboxCount, kidStats, useBanking, useTickets, useSets, useBadges, choresLabel, setsStepsLabel]);

  // ── Persisted per-user menubar layout ──
  // Loaded from the family-members payload by applyMenubarFromMember above
  // (the user row's `menubar_layout` TEXT column → JSON). Edits update
  // local state immediately and a debounced effect saves to the server so
  // it follows the user across devices.
  const [primaryKeys, setPrimaryKeys] = useState(null);
  // Tracks the most recently persisted JSON so we don't re-save the value
  // that just came down from the server.
  const lastSavedRef = useRef(null);
  useEffect(() => {
    if (!user || !primaryKeys) return;
    const json = JSON.stringify(primaryKeys);
    if (lastSavedRef.current === json) return;
    const t = setTimeout(() => {
      lastSavedRef.current = json;
      familyApi.updateMenubar(user.id, primaryKeys).catch(() => { /* silent — local UI already updated */ });
    }, 500);
    return () => clearTimeout(t);
  }, [primaryKeys, user?.id]);

  // Resolved primary / grouped secondary derived each render.
  const effectivePrimaryKeys = primaryKeys || defaultPrimaryKeys;
  const mobilePrimary = effectivePrimaryKeys
    .map((k) => allMobileItems.find((i) => i.key === k))
    .filter(Boolean);
  const mobileSecondary = allMobileItems.filter((i) => !effectivePrimaryKeys.includes(i.key));
  const secondaryBySection = mobileSecondary.reduce((acc, item) => {
    (acc[item.section] = acc[item.section] || []).push(item);
    return acc;
  }, {});

  // Edit-mode state (lives in More sheet).
  const [editMode, setEditMode] = useState(false);
  const [editSelectedKey, setEditSelectedKey] = useState(null);
  // Tap-to-swap. Selecting an item then tapping another swaps them in
  // primaryKeys. Tapping the same item again deselects.
  const handleEditTap = (key) => {
    if (!editSelectedKey) { setEditSelectedKey(key); return; }
    if (editSelectedKey === key) { setEditSelectedKey(null); return; }
    const a = editSelectedKey;
    const b = key;
    const next = [...effectivePrimaryKeys];
    const aIdx = next.indexOf(a);
    const bIdx = next.indexOf(b);
    if (aIdx >= 0 && bIdx >= 0) {
      // Both in primary — reorder.
      [next[aIdx], next[bIdx]] = [next[bIdx], next[aIdx]];
    } else if (aIdx >= 0 && bIdx < 0) {
      // a is primary, b is secondary — promote b, demote a.
      next[aIdx] = b;
    } else if (aIdx < 0 && bIdx >= 0) {
      // a is secondary, b is primary — promote a, demote b.
      next[bIdx] = a;
    }
    // (both secondary: no-op; not meaningful)
    setPrimaryKeys(next);
    setEditSelectedKey(null);
  };

  return (
    <div data-app-shell className="flex bg-gray-50 dark:bg-gray-900" style={{ height: 'var(--app-h, 100dvh)' }}>

      {/* ── Bottom panel backdrop (mobile) ──
          Inert now that the drawer is disabled; bottomPanelOpen never flips
          true since the hamburger is gone. */}
      {bottomPanelOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar (lg+ only) ──
          On lg+ this is a vertical sidebar (icon-only when collapsed, full
          width when expanded — controlled by the user's `sidebarCollapsed`
          preference). Below lg it's replaced by the floating mobile bottom
          bar rendered further down. */}
      {!isNarrow && (
      <aside
        ref={asideRef}
        onMouseOver={handleSidebarMouseOver}
        onMouseOut={handleSidebarMouseOut}
        className={`flex flex-col shrink-0 bg-white dark:bg-gray-800 border-r border-gray-100 dark:border-gray-700 shadow-sm transition-[width] duration-200 ${
          sidebarCollapsed
            ? 'w-14 [&_[data-nav-label]]:hidden [&_[data-nav-badge]]:hidden [&_[data-nav-divider]]:block'
            : 'w-56'
        }`}
      >
        {/* Sidebar header — title or just the icon when collapsed, plus a
            toggle button on the right (or stacked when collapsed). Hidden
            in mobile bottom-bar mode (no vertical room). */}
        <div className={`border-b border-gray-100 dark:border-gray-700 ${isNarrow ? 'hidden' : ''} ${effectiveCollapsed ? 'px-2 py-3 flex flex-col items-center gap-2' : 'px-4 py-5 flex items-center justify-between'}`}>
          <Link
            to="/dashboard"
            className={`font-bold text-brand-600 hover:text-brand-700 ${effectiveCollapsed ? 'text-xl' : 'text-lg'}`}
            title={effectiveCollapsed ? 'Family Dash · Dashboard' : undefined}
          >
            <FontAwesomeIcon icon={faPeopleRoof} className={effectiveCollapsed ? '' : 'mr-2'} />
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
          {/* Expand/collapse toggle — desktop only. Below lg the sidebar is
              always minimized, so giving the user a toggle would lie. */}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="hidden lg:block p-1 rounded-md text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <FontAwesomeIcon icon={sidebarCollapsed ? faAnglesRight : faAnglesLeft} className="text-sm" />
          </button>
        </div>

        <Nav collapsed={effectiveCollapsed} horizontal={isNarrow} />

        {/* Pending deposit banner (kid only). Hidden in mobile bottom-bar
            mode — there's no room and the Bank icon already conveys it. */}
        {!isNarrow && (kidStats?.pendingDepositCount || dexiePendingDepositCount) > 0 && (
          <button
            onClick={() => navigate(`/bank/${user.id}`, { state: { openReceive: true } })}
            className={`mx-3 mb-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-semibold hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors ${effectiveCollapsed ? 'justify-center' : ''}`}
            title="Money to receive"
          >
            <FontAwesomeIcon icon={faMoneyBillWave} className="text-[11px]" />
            <span data-nav-label>Money to receive!</span>
          </button>
        )}

        {/* User info + theme toggle + logout — stacks when collapsed so the
            avatar + icons keep the same touch targets. In mobile bottom-bar
            mode this becomes a small cluster on the right end of the bar
            (avatar + theme; logout dropped to save room). */}
        <div className={`border-gray-100 dark:border-gray-700 ${
          isNarrow
            ? 'shrink-0 border-l px-2 h-full flex flex-row items-center gap-1'
            : `border-t ${effectiveCollapsed ? 'px-2 py-3 flex flex-col items-center gap-2' : 'px-4 py-4 flex items-center gap-3'}`
        }`}>
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
      )}

      {/* ── Mobile floating bottom bar + More sheet ──
          Replaces the vertical aside below lg. Floats above the page with
          a small margin on all sides; safe-area-inset-bottom is honored so
          iOS home-indicator clears it. The More sheet sits ABOVE the bar
          (not over it), and exposes an Edit button for swapping primary
          slots — saved per-user so the layout follows the user across
          devices. */}
      {isNarrow && (
        <>
          {/* Bottom bar — z-50 so it stays on top of the More sheet (z-40)
              and the More-sheet backdrop (z-30). */}
          <div
            data-debug-nav
            className="fixed left-2 right-2 z-50 h-14 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-[0_8px_24px_rgba(0,0,0,0.14)] flex items-stretch"
            // `position: fixed` anchors to the layout viewport, which in some
            // in-app browsers (HappyWeb) is taller than the visible area by the
            // height of an overlay search bar. `100dvh - --app-h` is exactly
            // that hidden strip, so adding it lifts the bar into view.
            style={{ bottom: 'calc(100dvh - var(--app-h, 100dvh) + env(safe-area-inset-bottom) + 0.5rem)' }}
            role="navigation"
            aria-label="Primary"
          >
            {mobilePrimary.map((item) => {
              const isSelected = editMode && editSelectedKey === item.key;
              // Match the desktop sidebar's active pill: rounded background
              // + colored icon/text. `my-1 mx-0.5` insets the pill so it
              // doesn't fill the entire 56px slot edge-to-edge.
              const baseSlot = 'flex-1 min-w-0 my-1 mx-0.5 flex flex-col items-center justify-center gap-0.5 px-1 relative rounded-xl transition-colors';
              const selectedBg = 'bg-brand-50 dark:bg-gray-700 text-brand-700 dark:text-brand-400';
              const content = (
                <>
                  <span className="relative inline-flex">
                    <FontAwesomeIcon icon={item.icon} className="text-[17px]" />
                    {item.badge != null && item.badge !== 0 && (
                      <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 text-white text-[9px] font-semibold flex items-center justify-center leading-none ring-2 ring-white dark:ring-gray-800">
                        {item.badge}
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] font-medium leading-none truncate max-w-full px-0.5">{item.label}</span>
                </>
              );
              if (editMode) {
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleEditTap(item.key)}
                    className={`${baseSlot} ${isSelected ? `${selectedBg} ring-2 ring-brand-400` : 'text-gray-500 dark:text-gray-400'}`}
                    aria-label={`Edit slot: ${item.label}`}
                    aria-pressed={isSelected}
                  >
                    {content}
                  </button>
                );
              }
              if (item.action === 'quick-add') {
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setQuickActionsOpen(true)}
                    className={`${baseSlot} text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50`}
                  >
                    {content}
                  </button>
                );
              }
              return (
                <NavLink
                  key={item.key}
                  to={item.to}
                  end={item.to === '/dashboard'}
                  className={({ isActive }) => `${baseSlot} ${
                    isActive ? selectedBg : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  {content}
                </NavLink>
              );
            })}
            {(() => {
              // Roll up any counters from items that live in the "More"
              // sheet so the user sees them without opening it. Numeric only
              // — skips $ formatted strings (Bank balance, etc.).
              const moreBadge = mobileSecondary.reduce((sum, it) => {
                if (typeof it.badge === 'number' && it.badge > 0) return sum + it.badge;
                return sum;
              }, 0);
              return (
                <button
                  type="button"
                  onClick={() => setMoreOpen((o) => !o)}
                  className={`flex-1 min-w-0 my-1 mx-0.5 flex flex-col items-center justify-center gap-0.5 px-1 relative rounded-xl transition-colors ${
                    moreOpen ? 'bg-brand-50 dark:bg-gray-700 text-brand-700 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                  aria-label="More options"
                  aria-expanded={moreOpen}
                >
                  <span className="relative inline-flex">
                    <FontAwesomeIcon icon={moreOpen ? faXmark : faEllipsis} className="text-[17px]" />
                    {moreBadge > 0 && !moreOpen && (
                      <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 text-white text-[9px] font-semibold flex items-center justify-center leading-none ring-2 ring-white dark:ring-gray-800">
                        {moreBadge}
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] font-medium leading-none">More</span>
                </button>
              );
            })()}
          </div>

          {moreOpen && (
            <>
              {/* Backdrop stops above the bar so the bar stays visible &
                  tappable. */}
              <div
                className="fixed left-0 right-0 top-0 z-30 bg-black/40"
                style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4rem)' }}
                onClick={() => { setMoreOpen(false); setEditMode(false); setEditSelectedKey(null); }}
                aria-hidden="true"
              />
              {/* Sheet sits ABOVE the bar; its bottom edge meets the bar's
                  top edge with a small gap. */}
              <div
                className="fixed left-0 right-0 z-40 bg-white dark:bg-gray-800 rounded-t-2xl shadow-[0_-8px_24px_rgba(0,0,0,0.2)] max-h-[70vh] overflow-y-auto"
                style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4rem)' }}
                role="dialog"
                aria-modal="true"
                aria-label="More menu"
              >
                <div className="sticky top-0 bg-white dark:bg-gray-800 px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    {editMode ? 'Customize menubar' : 'More'}
                  </h2>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => { setEditMode((m) => !m); setEditSelectedKey(null); }}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        editMode
                          ? 'bg-brand-600 text-white hover:bg-brand-700'
                          : 'text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-gray-700'
                      }`}
                      aria-pressed={editMode}
                    >
                      {editMode ? 'Done' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMoreOpen(false); setEditMode(false); setEditSelectedKey(null); }}
                      className="p-1 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      aria-label="Close more menu"
                    >
                      <FontAwesomeIcon icon={faXmark} className="text-base" />
                    </button>
                  </div>
                </div>

                {editMode && (
                  <div className="px-4 py-2 text-[12px] text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                    {editSelectedKey
                      ? <>Tap another icon to <strong>swap</strong>, or tap the selected one again to cancel.</>
                      : <>Tap any icon (on the bar below or in the grid) to start a swap.</>}
                  </div>
                )}

                {/* Overflow nav items, grouped by section. */}
                {['main', 'individual', 'settings', 'admin'].map((sec) => {
                  const items = secondaryBySection[sec];
                  if (!items?.length) return null;
                  const heading = {
                    main: null, // ungrouped
                    individual: 'Individual Pages',
                    settings: 'Settings',
                    admin: 'Admin',
                  }[sec];
                  return (
                    <div key={sec}>
                      {heading && (
                        <div className="px-4 pt-3 pb-1 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                          {heading}
                        </div>
                      )}
                      <div className="grid grid-cols-5 gap-1 px-3 pb-2">
                        {items.map((item) => {
                          const isSelected = editMode && editSelectedKey === item.key;
                          const tileClasses = `flex flex-col items-center justify-center gap-1 py-3 px-1 rounded-lg transition-all ${
                            isSelected
                              ? 'bg-brand-100 dark:bg-brand-900/40 ring-2 ring-brand-400 scale-[0.97]'
                              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`;
                          const inner = (
                            <>
                              <FontAwesomeIcon icon={item.icon} className={`text-lg ${isSelected ? 'text-brand-600 dark:text-brand-300' : ''}`} />
                              <span className={`text-[11px] font-medium leading-tight text-center break-words ${isSelected ? 'text-brand-700 dark:text-brand-200' : ''}`}>{item.label}</span>
                            </>
                          );
                          if (editMode) {
                            return (
                              <button
                                key={item.key}
                                type="button"
                                onClick={() => handleEditTap(item.key)}
                                className={tileClasses}
                                aria-label={`Edit: ${item.label}`}
                                aria-pressed={isSelected}
                              >
                                {inner}
                              </button>
                            );
                          }
                          if (item.action === 'quick-add') {
                            // Non-nav: opens the QuickActions modal instead
                            // of routing somewhere.
                            return (
                              <button
                                key={item.key}
                                type="button"
                                onClick={() => { setMoreOpen(false); setQuickActionsOpen(true); }}
                                className={tileClasses}
                              >
                                {inner}
                              </button>
                            );
                          }
                          return (
                            <NavLink
                              key={item.key}
                              to={item.to}
                              onClick={() => setMoreOpen(false)}
                              className={({ isActive }) => `${tileClasses} ${
                                isActive ? 'bg-brand-50 text-brand-700 dark:bg-gray-700 dark:text-brand-400' : ''
                              }`}
                            >
                              {inner}
                            </NavLink>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Pending-deposit shortcut (kid only) */}
                {!editMode && (kidStats?.pendingDepositCount || dexiePendingDepositCount) > 0 && (
                  <button
                    onClick={() => { setMoreOpen(false); navigate(`/bank/${user.id}`, { state: { openReceive: true } }); }}
                    className="mx-3 mb-2 w-[calc(100%-1.5rem)] flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-sm font-semibold hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors"
                  >
                    <FontAwesomeIcon icon={faMoneyBillWave} />
                    Money to receive!
                  </button>
                )}

                {/* Profile / theme / sign-out — hidden in edit mode to keep
                    focus on the swap UX. */}
                {!editMode && (
                  <div className="border-t border-gray-100 dark:border-gray-700 p-3 space-y-1">
                    <button
                      type="button"
                      onClick={() => { setMoreOpen(false); setEmojiOpen(true); }}
                      className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                    >
                      <Avatar name={user?.name || '?'} color={user?.avatarColor || '#6366f1'} emoji={user?.avatarEmoji} size="sm" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium truncate">{user?.name}</span>
                        <span className="block text-xs text-gray-400 dark:text-gray-500 capitalize">{user?.role}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={toggleTheme}
                      className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                    >
                      <span className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">
                        {isDark ? <SunIcon /> : <MoonIcon />}
                      </span>
                      <span className="text-sm font-medium">{isDark ? 'Switch to light mode' : 'Switch to dark mode'}</span>
                    </button>
                    {user?.role !== 'kid' && (
                      <button
                        type="button"
                        onClick={() => { setMoreOpen(false); handleLogout(); }}
                        className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                      >
                        <span className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">
                          <FontAwesomeIcon icon={faRightFromBracket} />
                        </span>
                        <span className="text-sm font-medium">Sign out</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Custom instant tooltip for the collapsed desktop sidebar. Updated
          imperatively via tipElRef so hovering doesn't re-render Layout and
          remount the NavLinks. Mobile uses labeled icons on the bottom bar
          so no hover tooltip is needed there. */}
      {!isNarrow && sidebarCollapsed && (
        <div
          ref={tipElRef}
          className="hidden lg:block fixed z-50 px-3 py-2 rounded-md bg-gray-900 dark:bg-gray-700 text-white text-[15px] font-medium shadow-xl ring-1 ring-black/10 pointer-events-none whitespace-nowrap"
          style={{ display: 'none', transform: 'translateY(-50%)' }}
          role="tooltip"
        />
      )}

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

        {/* Mobile top bar — kept in the tree for the hamburger + drawer code
            paths but never displayed now that the sidebar is always visible
            in icon-only form below lg. */}
        <header className="hidden sticky top-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3 shadow-sm" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
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
        <main
          className={`flex-1 overflow-x-hidden overflow-y-auto p-4 lg:p-6 ${bottomPanelOpen ? 'overflow-hidden' : ''}`}
          // On mobile the menubar floats at `bottom = safe-area + 0.5rem` with
          // a 56px (h-14) height, so the scroll area needs that much padding
          // plus a small gap so the last content row sits comfortably above.
          style={{ paddingBottom: isNarrow
            ? 'calc(100dvh - var(--app-h, 100dvh) + 3.5rem + env(safe-area-inset-bottom) + 1.5rem)'
            : 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <div className="max-w-6xl mx-auto">
            {/* Keyed by pathname so a crashed page resets the boundary when
                the user navigates elsewhere (otherwise the fallback sticks). */}
            <ErrorBoundary key={location.pathname}>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>

        <InstallPrompt />
        <QuickActionsFab open={quickActionsOpen} onClose={() => setQuickActionsOpen(false)} />

        {/* ── Slide-in side panel (mobile only) ──
            Disabled now that the sidebar is always visible. Left in the tree
            (with `hidden` instead of `lg:hidden`) until we strip the
            associated state cleanly. */}
        <div
          className="hidden fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 shadow-2xl flex flex-col"
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
