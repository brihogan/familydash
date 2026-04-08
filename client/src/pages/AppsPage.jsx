import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRocket, faTerminal, faPlay, faStar as faStarSolid, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import { faStar as faStarOutline } from '@fortawesome/free-regular-svg-icons';
import { useAuth } from '../context/AuthContext.jsx';
import { claudeApi } from '../api/claude.api.js';
import Avatar from '../components/shared/Avatar.jsx';
import Modal from '../components/shared/Modal.jsx';
import KidWorkspace from '../components/claude/KidWorkspace.jsx';

function AppCard({ app, kid, canEdit, onLaunch, onEdit, onToggleStar }) {
  const handleCardClick = () => onLaunch(kid.username, app.name);
  const handleIconClick = (e) => {
    if (!canEdit) return;
    e.stopPropagation();
    onEdit({ kidId: kid.id, appName: app.name, description: app.description, icon: app.icon || '' });
  };
  const handleStarClick = (e) => {
    e.stopPropagation();
    onToggleStar(kid.id, app.name);
  };

  return (
    <div
      onClick={handleCardClick}
      className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-brand-300 dark:hover:border-brand-500/50 transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={handleIconClick}
            disabled={!canEdit}
            title={canEdit ? 'Edit app' : undefined}
            className={`w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-500/20 flex items-center justify-center text-lg shrink-0 ${canEdit ? 'hover:ring-2 hover:ring-brand-300 dark:hover:ring-brand-500/50' : ''}`}
          >
            {app.icon || <FontAwesomeIcon icon={faRocket} className="text-brand-500 text-sm" />}
          </button>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{app.name.replace(/[-_]/g, ' ')}</p>
            {app.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{app.description}</p>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3 text-xs text-gray-400 dark:text-gray-500">
        <span>
          <FontAwesomeIcon icon={faPlay} className="mr-1" />
          {app.launches}
        </span>
        <button
          type="button"
          onClick={handleStarClick}
          title={app.starred ? 'Unstar' : 'Star'}
          className={`flex items-center gap-1 transition-colors ${
            app.starred ? 'text-amber-400' : 'hover:text-amber-400'
          }`}
        >
          <FontAwesomeIcon icon={app.starred ? faStarSolid : faStarOutline} />
          <span>{app.stars || 0}</span>
        </button>
      </div>
    </div>
  );
}

export default function AppsPage() {
  const { user } = useAuth();
  const [kids, setKids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [myTimeLimit, setMyTimeLimit] = useState(60);
  const [expandedKids, setExpandedKids] = useState({}); // { [kidId]: true }

  // Unified workspace
  const [workspace, setWorkspace] = useState(null); // { userId, initialView: 'terminal' | { url, appName } }

  const load = () => {
    claudeApi.listApps()
      .then((data) => {
        setKids(data.kids);
        if (data.myTimeLimit != null) setMyTimeLimit(data.myTimeLimit);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const hasApps = kids.some((k) => k.apps.length > 0);

  // Build flat app list for the workspace dropdown (includes owner + starred info)
  const allAppsFlat = kids.flatMap((kid) =>
    kid.apps.map((app) => ({
      appName: app.name,
      username: kid.username,
      ownerName: kid.name,
      ownerId: kid.id,
      icon: app.icon,
      starred: app.starred,
      url: import.meta.env.VITE_APPS_ORIGIN
        ? `${import.meta.env.VITE_APPS_ORIGIN}/${kid.username}/${app.name}/`
        : `/apps/${kid.username}/${app.name}/`,
    }))
  );

  const handleLaunch = async (username, appName) => {
    claudeApi.launchApp(username, appName).catch(() => {});
    const url = `/apps/${username}/${appName}/`;
    setWorkspace({ userId: user?.id, initialView: { url, appName } });

    setKids((prev) => prev.map((k) =>
      k.username === username
        ? { ...k, apps: k.apps.map((a) => a.name === appName ? { ...a, launches: a.launches + 1 } : a) }
        : k
    ));
  };

  const handleOpenTerminal = (kidId) => {
    setWorkspace({ userId: kidId, initialView: 'terminal' });
  };

  const handleEditSave = async () => {
    if (!editing) return;
    try {
      await claudeApi.updateAppMeta(editing.kidId, editing.appName, {
        description: editing.description,
        icon: editing.icon,
      });
      setKids((prev) => prev.map((k) =>
        k.id === editing.kidId
          ? { ...k, apps: k.apps.map((a) => a.name === editing.appName ? { ...a, description: editing.description, icon: editing.icon } : a) }
          : k
      ));
    } catch { /* ignore */ }
    setEditing(null);
  };

  const handleToggleStar = async (kidId, appName) => {
    try {
      const { starred, stars } = await claudeApi.toggleStar(kidId, appName);
      setKids((prev) => prev.map((k) =>
        k.id === kidId
          ? { ...k, apps: k.apps.map((a) => a.name === appName ? { ...a, starred, stars } : a) }
          : k
      ));
    } catch { /* ignore */ }
  };

  const favorites = kids.flatMap((kid) =>
    kid.apps.filter((a) => a.starred).map((a) => ({ ...a, kid }))
  );

  const canEdit = (kidId) => user?.role === 'parent' || user?.id === kidId;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          <FontAwesomeIcon icon={faRocket} className="mr-2 text-brand-500" />
          Apps
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Web apps built by kids with Claude Code.
        </p>
      </div>

      {/* Terminal buttons */}
      {kids.length > 0 && (() => {
        const accessible = kids.filter((k) => user?.role === 'parent' || user?.id === k.id);
        if (!accessible.length) return null;
        return (
          <div className="mb-6">
            <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1 mb-2">Open Terminal</h2>
            <div className="flex flex-wrap gap-2">
              {accessible.map((kid) => (
                <button
                  key={kid.id}
                  onClick={() => handleOpenTerminal(kid.id)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <FontAwesomeIcon icon={faTerminal} className="text-xs" />
                  {kid.id === user?.id ? 'My Terminal' : kid.name}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !hasApps ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <FontAwesomeIcon icon={faRocket} className="text-4xl mb-3" />
          <p className="text-lg font-medium mb-1">No apps yet</p>
          <p className="text-sm">Open a terminal and start building!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {favorites.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FontAwesomeIcon icon={faStarSolid} className="text-amber-400" />
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">My Favorites</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {favorites.map((fav) => (
                  <AppCard
                    key={`${fav.kid.id}-${fav.name}`}
                    app={fav} kid={fav.kid}
                    canEdit={canEdit(fav.kid.id)}
                    onLaunch={handleLaunch} onEdit={setEditing} onToggleStar={handleToggleStar}
                  />
                ))}
              </div>
            </div>
          )}

          {kids.filter((k) => k.apps.length > 0).map((kid) => {
            const landingUrl = import.meta.env.VITE_APPS_ORIGIN
              ? `${import.meta.env.VITE_APPS_ORIGIN}/${kid.username}/`
              : `/apps/${kid.username}/`;
            const sortedApps = [...kid.apps].sort((a, b) => (b.launches || 0) - (a.launches || 0));
            const expanded = !!expandedKids[kid.id];
            const visibleApps = expanded ? sortedApps : sortedApps.slice(0, 3);
            const hiddenCount = sortedApps.length - 3;
            return (
            <div key={kid.id}>
              <a
                href={landingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 mb-3 group"
                title={`Open ${kid.name}'s landing page`}
              >
                <Avatar name={kid.name} color={kid.avatar_color} emoji={kid.avatar_emoji} size="sm" />
                <h2 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">{kid.name}</h2>
              </a>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {visibleApps.map((app) => (
                  <AppCard
                    key={app.name}
                    app={app} kid={kid}
                    canEdit={canEdit(kid.id)}
                    onLaunch={handleLaunch} onEdit={setEditing} onToggleStar={handleToggleStar}
                  />
                ))}
              </div>
              {hiddenCount > 0 && (
                <button
                  onClick={() => setExpandedKids((prev) => ({ ...prev, [kid.id]: !expanded }))}
                  className="mt-3 flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                >
                  <FontAwesomeIcon icon={expanded ? faChevronUp : faChevronDown} />
                  {expanded ? 'Show less' : `Show ${hiddenCount} more`}
                </button>
              )}
            </div>
            );
          })}
        </div>
      )}

      {/* Edit modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit App">
        {editing && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Icon (emoji)</label>
              <input
                type="text"
                value={editing.icon}
                onChange={(e) => setEditing((prev) => ({ ...prev, icon: e.target.value }))}
                maxLength={4}
                placeholder="e.g. 🎮"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
              <input
                type="text"
                value={editing.description}
                onChange={(e) => setEditing((prev) => ({ ...prev, description: e.target.value }))}
                maxLength={500}
                placeholder="What does this app do?"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm rounded-lg font-medium transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Unified workspace (kids and parents) */}
      {workspace && (
        <KidWorkspace
          userId={workspace.userId}
          timeLimit={myTimeLimit}
          allApps={allAppsFlat}
          initialView={workspace.initialView}
          onClose={() => { setWorkspace(null); load(); }}
        />
      )}
    </div>
  );
}
