import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRocket, faTerminal, faArrowUpRightFromSquare, faPen, faPlay } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../context/AuthContext.jsx';
import { claudeApi } from '../api/claude.api.js';
import Avatar from '../components/shared/Avatar.jsx';
import Modal from '../components/shared/Modal.jsx';
import ClaudeTerminal from '../components/claude/ClaudeTerminal.jsx';

export default function AppsPage() {
  const { user } = useAuth();
  const [kids, setKids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [terminalKid, setTerminalKid] = useState(null);
  const [editing, setEditing] = useState(null); // { kidId, appName, description, icon }

  const load = () => {
    claudeApi.listApps()
      .then((data) => setKids(data.kids))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const hasApps = kids.some((k) => k.apps.length > 0);

  const handleLaunch = async (username, appName) => {
    claudeApi.launchApp(username, appName).catch(() => {});
    window.open(`/apps/${username}/${appName}/`, '_blank');
    // Optimistically bump the counter in the UI
    setKids((prev) => prev.map((k) =>
      k.username === username
        ? { ...k, apps: k.apps.map((a) => a.name === appName ? { ...a, launches: a.launches + 1 } : a) }
        : k
    ));
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

  const canEdit = (kidId) => user?.role === 'parent' || user?.userId === kidId;

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
        const accessible = kids.filter((k) => user?.role === 'parent' || user?.userId === k.id);
        if (!accessible.length) return null;
        return (
          <div className="mb-6">
            <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1 mb-2">Open Terminal</h2>
            <div className="flex flex-wrap gap-2">
              {accessible.map((kid) => (
                <button
                  key={kid.id}
                  onClick={() => setTerminalKid(kid.id)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <FontAwesomeIcon icon={faTerminal} className="text-xs" />
                  {user?.role === 'parent' ? kid.name : 'My Terminal'}
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
          {kids.filter((k) => k.apps.length > 0).map((kid) => (
            <div key={kid.id}>
              <div className="flex items-center gap-2 mb-3">
                <Avatar name={kid.name} color={kid.avatar_color} emoji={kid.avatar_emoji} size="sm" />
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">{kid.name}</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {kid.apps.map((app) => (
                  <div
                    key={app.name}
                    className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-brand-300 dark:hover:border-brand-500/50 transition-all"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-500/20 flex items-center justify-center text-lg shrink-0">
                          {app.icon || <FontAwesomeIcon icon={faRocket} className="text-brand-500 text-sm" />}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{app.name.replace(/[-_]/g, ' ')}</p>
                          {app.description && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{app.description}</p>
                          )}
                        </div>
                      </div>
                      {canEdit(kid.id) && (
                        <button
                          onClick={() => setEditing({ kidId: kid.id, appName: app.name, description: app.description, icon: app.icon || '' })}
                          className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 shrink-0 ml-2"
                        >
                          <FontAwesomeIcon icon={faPen} className="text-xs" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        <FontAwesomeIcon icon={faPlay} className="mr-1" />
                        {app.launches} {app.launches === 1 ? 'launch' : 'launches'}
                      </span>
                      <button
                        onClick={() => handleLaunch(kid.username, app.name)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-medium transition-colors"
                      >
                        Open
                        <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-[10px]" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
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

      {terminalKid && (
        <ClaudeTerminal userId={terminalKid} onClose={() => setTerminalKid(null)} />
      )}
    </div>
  );
}
