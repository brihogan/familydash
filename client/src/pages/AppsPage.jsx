import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRocket, faTerminal, faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../context/AuthContext.jsx';
import { claudeApi } from '../api/claude.api.js';
import Avatar from '../components/shared/Avatar.jsx';
import ClaudeTerminal from '../components/claude/ClaudeTerminal.jsx';

export default function AppsPage() {
  const { user } = useAuth();
  const [kids, setKids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [terminalKid, setTerminalKid] = useState(null);

  useEffect(() => {
    claudeApi.listApps()
      .then((data) => setKids(data.kids))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const hasApps = kids.some((k) => k.apps.length > 0);

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

      {/* Terminal buttons for kids with Claude enabled */}
      {kids.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1 mb-2">Open Terminal</h2>
          <div className="flex flex-wrap gap-2">
            {kids.map((kid) => {
              // Show terminal button if current user is parent, or kid viewing their own
              const canOpen = user?.role === 'parent' || user?.userId === kid.id;
              if (!canOpen) return null;
              return (
                <button
                  key={kid.id}
                  onClick={() => setTerminalKid(kid.id)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <FontAwesomeIcon icon={faTerminal} className="text-xs" />
                  {kid.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
                  <a
                    key={app}
                    href={`/apps/${kid.username}/${app}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-brand-300 dark:hover:border-brand-500/50 transition-all group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-500/20 flex items-center justify-center text-brand-600 dark:text-brand-400">
                        <FontAwesomeIcon icon={faRocket} className="text-sm" />
                      </span>
                      <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{app.replace(/[-_]/g, ' ')}</span>
                    </div>
                    <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-gray-300 dark:text-gray-600 group-hover:text-brand-400 text-xs shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {terminalKid && (
        <ClaudeTerminal userId={terminalKid} onClose={() => setTerminalKid(null)} />
      )}
    </div>
  );
}
