import { useState, useEffect } from 'react';
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHouse, faTrophy, faTachographDigital, faBroom,
  faPiggyBank, faTicket, faUsers, faScroll, faRightFromBracket,
  faMedal, faClipboardCheck,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import Avatar from './Avatar.jsx';
import EmojiPicker from './EmojiPicker.jsx';
import { familyApi } from '../../api/family.api.js';
import { overviewApi } from '../../api/overview.api.js';
import { taskSetsApi } from '../../api/taskSets.api.js';
import { formatCents } from '../../utils/formatCents.js';

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
  const navigate = useNavigate();
  const location = useLocation();
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [firstKidId, setFirstKidId] = useState(null);
  const [kidStats, setKidStats] = useState(null);

  // Fetch nav badge stats for kids
  useEffect(() => {
    if (user?.role !== 'kid') return;
    Promise.all([
      overviewApi.getOverview(user.id),
      taskSetsApi.getUserTaskSets(user.id),
    ]).then(([overview, taskData]) => {
      const mainAccount = overview.accounts.find((a) => a.type === 'main');
      setKidStats({
        choresRemaining:  overview.choreProgressToday.total - overview.choreProgressToday.done,
        mainBalanceCents: mainAccount?.balance_cents ?? 0,
        ticketBalance:    overview.ticketBalance,
        taskSetsCount:          taskData.taskSets.filter(
        (ts) => !(ts.step_count > 0 && ts.completed_count === ts.step_count)
      ).length,
      completedTaskSetsCount: taskData.taskSets.filter(
        (ts) => ts.type === 'Award' && ts.step_count > 0 && ts.completed_count === ts.step_count
      ).length,
      });
    }).catch(() => {});
  }, [user?.role, user?.id]);

  // Fetch first kid for parent "Kid Pages" nav links
  useEffect(() => {
    if (user?.role !== 'parent') return;
    familyApi.getFamily().then((data) => {
      const sorted = (data.members || [])
        .filter((m) => m.role === 'kid' && m.is_active !== 0)
        .sort((a, b) => {
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
          return a.name.localeCompare(b.name);
        });
      if (sorted.length > 0) setFirstKidId(sorted[0].id);
    }).catch(() => {});
  }, [user?.role]);

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

  // NavLink base class
  const navClass = ({ isActive }) =>
    `flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
      isActive
        ? 'bg-brand-50 text-brand-700 font-medium dark:bg-gray-700 dark:text-brand-500'
        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
    }`;

  // Active class for kid-path links that match any /:base/:id
  const kidPathClass = (base) =>
    `flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
      location.pathname.startsWith(base + '/')
        ? 'bg-brand-50 text-brand-700 font-medium dark:bg-gray-700 dark:text-brand-500'
        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
    }`;

  const Nav = () => (
    <nav className="flex-1 px-3 py-4 space-y-1 text-sm">
      <NavLink to="/dashboard" className={navClass} onClick={close}>
        <FontAwesomeIcon icon={faHouse} className="w-4 shrink-0" />
        Dashboard
      </NavLink>

      {user?.role === 'parent' && (
        <>
          {firstKidId && (
            <>
              <div className="pt-2 pb-1 px-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Kid Pages
              </div>
              <NavLink to={`/kid/${firstKidId}`} className={() => kidPathClass('/kid')} onClick={close}>
                <FontAwesomeIcon icon={faTachographDigital} className="w-4 shrink-0" />
                Overview
              </NavLink>
              <NavLink to={`/chores/${firstKidId}`} className={() => kidPathClass('/chores')} onClick={close}>
                <FontAwesomeIcon icon={faBroom} className="w-4 shrink-0" />
                Chores
              </NavLink>
              <NavLink to={`/bank/${firstKidId}`} className={() => kidPathClass('/bank')} onClick={close}>
                <FontAwesomeIcon icon={faPiggyBank} className="w-4 shrink-0" />
                Bank
              </NavLink>
              <NavLink to={`/tickets/${firstKidId}`} className={() => kidPathClass('/tickets')} onClick={close}>
                <FontAwesomeIcon icon={faTicket} className="w-4 shrink-0" />
                Tickets
              </NavLink>
              <NavLink to={`/tasks/${firstKidId}`} className={() => kidPathClass('/tasks')} onClick={close}>
                <FontAwesomeIcon icon={faMedal} className="w-4 shrink-0" />
                Sets &amp; Steps
              </NavLink>
              <NavLink to={`/trophies/${firstKidId}`} className={() => kidPathClass('/trophies')} onClick={close}>
                <FontAwesomeIcon icon={faTrophy} className="w-4 shrink-0" />
                Trophies
              </NavLink>
            </>
          )}

          <div className="pt-2 pb-1 px-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Settings
          </div>
          <NavLink to="/settings/users" className={navClass} onClick={close}>
            <FontAwesomeIcon icon={faUsers} className="w-4 shrink-0" />
            Family Members
          </NavLink>
          <NavLink to="/settings/tasks" className={navClass} onClick={close}>
            <FontAwesomeIcon icon={faClipboardCheck} className="w-4 shrink-0" />
            Manage Sets
          </NavLink>
          <NavLink to="/rewards" className={navClass} onClick={close}>
            <FontAwesomeIcon icon={faTrophy} className="w-4 shrink-0" />
            Rewards
          </NavLink>
          <NavLink to="/family-activity" className={navClass} onClick={close}>
            <FontAwesomeIcon icon={faScroll} className="w-4 shrink-0" />
            Family Activity
          </NavLink>
        </>
      )}

      {user?.role === 'kid' && (
        <>
          <NavLink to={`/kid/${user.id}`} className={navClass} onClick={close}>
            <FontAwesomeIcon icon={faTachographDigital} className="w-4 shrink-0" />
            My Overview
          </NavLink>
          <NavLink to={`/chores/${user.id}`} className={navClass} onClick={close}>
            <FontAwesomeIcon icon={faBroom} className="w-4 shrink-0" />
            My Chores
            {kidStats && (
              <span className={`ml-auto text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full leading-tight ${
                kidStats.choresRemaining > 0
                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-gray-400'
                  : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-gray-400'
              }`}>
                {kidStats.choresRemaining > 0 ? kidStats.choresRemaining : '✓'}
              </span>
            )}
          </NavLink>
          <NavLink to={`/bank/${user.id}`} className={navClass} onClick={close}>
            <FontAwesomeIcon icon={faPiggyBank} className="w-4 shrink-0" />
            My Bank
            {kidStats && (
              <span className="ml-auto text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full leading-tight bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                {formatCents(kidStats.mainBalanceCents)}
              </span>
            )}
          </NavLink>
          <NavLink to={`/tickets/${user.id}`} className={navClass} onClick={close}>
            <FontAwesomeIcon icon={faTicket} className="w-4 shrink-0" />
            My Tickets
            {kidStats && (
              <span className="ml-auto text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full leading-tight bg-brand-50 dark:bg-brand-500/20 text-brand-700 dark:text-gray-400">
                {kidStats.ticketBalance}
              </span>
            )}
          </NavLink>
          <NavLink to={`/tasks/${user.id}`} className={navClass} onClick={close}>
            <FontAwesomeIcon icon={faMedal} className="w-4 shrink-0" />
            My Sets
            {kidStats && (
              <span className="ml-auto text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full leading-tight bg-brand-50 dark:bg-brand-500/20 text-brand-700 dark:text-gray-400">
                {kidStats.taskSetsCount}
              </span>
            )}
          </NavLink>
          <NavLink to={`/trophies/${user.id}`} className={navClass} onClick={close}>
            <FontAwesomeIcon icon={faTrophy} className="w-4 shrink-0" />
            My Trophies
            {kidStats && kidStats.completedTaskSetsCount > 0 && (
              <span className="ml-auto text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full leading-tight bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-gray-400">
                {kidStats.completedTaskSetsCount}
              </span>
            )}
          </NavLink>
          <NavLink to="/rewards" className={navClass} onClick={close}>
            <FontAwesomeIcon icon={faTrophy} className="w-4 shrink-0" />
            Rewards
          </NavLink>
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

      {/* ── Sidebar (desktop only) ── */}
      <aside className="hidden lg:flex lg:flex-col lg:w-56 lg:shrink-0 bg-white dark:bg-gray-800 border-r border-gray-100 dark:border-gray-700 shadow-sm">
        {/* Sidebar header */}
        <div className="px-4 py-5 border-b border-gray-100 dark:border-gray-700">
          <Link to="/dashboard" className="text-lg font-bold text-brand-600 hover:text-brand-700">Family Dashboard</Link>
        </div>

        <Nav />

        {/* User info + theme toggle + logout */}
        <div className="px-4 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEmojiOpen(true)}
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
          <button
            onClick={handleLogout}
            className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            title="Sign out"
          >
            <FontAwesomeIcon icon={faRightFromBracket} />
          </button>
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
        <header className="lg:hidden sticky top-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3 shadow-sm">
          <Link to="/dashboard" className="font-bold text-brand-600 text-base hover:text-brand-700">Family Dashboard</Link>
          <div className="ml-auto">
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

        {/* Page content — extra bottom padding on mobile to clear the bottom bar */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 pb-20 lg:p-6 lg:pb-6">
          <Outlet />
        </main>

        {/* ── Bottom bar (mobile only) ── */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg">
          <div className="flex items-center justify-between px-6 py-2">
            <button
              onClick={() => setBottomPanelOpen((o) => !o)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Toggle navigation menu"
            >
              <HamburgerIcon />
              <span className="text-sm font-medium">Menu</span>
            </button>
            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
              <span className="text-sm font-medium">{isDark ? 'Light' : 'Dark'}</span>
            </button>
          </div>
        </div>

        {/* ── Bottom sheet panel (mobile only) ── */}
        <div
          className={`
            lg:hidden fixed bottom-0 left-0 right-0 z-50
            bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl
            transition-transform duration-300 ease-in-out
            max-h-[75vh] flex flex-col
            ${bottomPanelOpen ? 'translate-y-0' : 'translate-y-full'}
          `}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
          </div>

          {/* User info row */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
            <button
              type="button"
              onClick={() => { setEmojiOpen(true); close(); }}
              className="flex-shrink-0 rounded-full hover:opacity-80 transition-opacity"
              title="Change avatar"
            >
              <Avatar name={user?.name || '?'} color={user?.avatarColor || '#6366f1'} emoji={user?.avatarEmoji} size="sm" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 capitalize">{user?.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              title="Sign out"
            >
              <FontAwesomeIcon icon={faRightFromBracket} />
            </button>
            <button
              onClick={close}
              className="p-1 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Close menu"
            >
              <CloseIcon />
            </button>
          </div>

          {/* Nav links */}
          <div className="flex-1 overflow-y-auto">
            <Nav />
          </div>
        </div>

      </div>
    </div>
  );
}
