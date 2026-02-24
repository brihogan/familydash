import { useState, useEffect } from 'react';
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHouse, faTrophy, faTachographDigital, faBroom,
  faPiggyBank, faTicket, faUsers, faScroll,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';
import EmojiPicker from './EmojiPicker.jsx';
import { familyApi } from '../../api/family.api.js';

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

export default function Layout() {
  const { user, logout, patchUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [firstKidId, setFirstKidId] = useState(null);

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

  const close = () => setSidebarOpen(false);

  // NavLink base class — flex so icon + label sit side-by-side
  const navClass = ({ isActive }) =>
    `flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
      isActive ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-600 hover:bg-gray-100'
    }`;

  // Active class for kid-path links that should match any /:base/:id
  const kidPathClass = (base) =>
    `flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
      location.pathname.startsWith(base + '/')
        ? 'bg-brand-50 text-brand-700 font-medium'
        : 'text-gray-600 hover:bg-gray-100'
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
              <div className="pt-2 pb-1 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
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
            </>
          )}

          <div className="pt-2 pb-1 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Settings
          </div>
          <NavLink to="/settings/users" className={navClass} onClick={close}>
            <FontAwesomeIcon icon={faUsers} className="w-4 shrink-0" />
            Family Members
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
          </NavLink>
          <NavLink to={`/bank/${user.id}`} className={navClass} onClick={close}>
            <FontAwesomeIcon icon={faPiggyBank} className="w-4 shrink-0" />
            My Bank
          </NavLink>
          <NavLink to={`/tickets/${user.id}`} className={navClass} onClick={close}>
            <FontAwesomeIcon icon={faTicket} className="w-4 shrink-0" />
            My Tickets
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
    <div className="flex h-dvh bg-gray-50">

      {/* ── Mobile backdrop ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl flex flex-col transition-transform duration-200 ease-in-out
          lg:relative lg:w-56 lg:z-auto lg:shadow-sm lg:translate-x-0 lg:shrink-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Sidebar header */}
        <div className="px-4 py-5 border-b border-gray-100 flex items-center justify-between">
          <Link to="/dashboard" className="text-lg font-bold text-brand-600 hover:text-brand-700">Family Dashboard</Link>
          <button
            onClick={close}
            className="lg:hidden p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            aria-label="Close menu"
          >
            <CloseIcon />
          </button>
        </div>

        <Nav />

        {/* User info + logout */}
        <div className="px-4 py-4 border-t border-gray-100 flex items-center gap-3">
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
            <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
          >
            Out
          </button>
        </div>
      </aside>

      {/* Emoji picker for own avatar (accessible from sidebar + mobile header) */}
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
        <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Open menu"
          >
            <HamburgerIcon />
          </button>
          <Link to="/dashboard" className="font-bold text-brand-600 text-base hover:text-brand-700">Family Dashboard</Link>
          <div className="ml-auto flex items-center gap-2">
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

        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
