import { useState, useEffect, Fragment } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldHalved, faUsers, faArrowRightToBracket, faTriangleExclamation, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import { adminApi } from '../api/admin.api.js';

const CARD = 'bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5';
const STAT_CARD = 'bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 text-center';

function timeAgo(dateStr) {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  return d.toLocaleString();
}

function parseUA(ua) {
  if (!ua) return 'Unknown';
  if (ua.includes('Capacitor')) return 'iOS App';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS Safari';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  return 'Other';
}

function activityColor(lastLogin) {
  if (!lastLogin) return 'bg-gray-300 dark:bg-gray-600';
  const days = (Date.now() - new Date(lastLogin.endsWith('Z') ? lastLogin : lastLogin + 'Z').getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 1) return 'bg-green-500';
  if (days <= 7) return 'bg-green-400';
  if (days <= 30) return 'bg-yellow-400';
  return 'bg-red-400';
}

export default function AdminPage() {
  const [dashboard, setDashboard] = useState(null);
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [expandedFamily, setExpandedFamily] = useState(null);
  const [familyDetail, setFamilyDetail] = useState(null);
  const [familyDetailLoading, setFamilyDetailLoading] = useState(false);
  const [showAllLogs, setShowAllLogs] = useState(false);

  useEffect(() => {
    adminApi.getDashboard()
      .then(setDashboard)
      .catch(() => {})
      .finally(() => setLoading(false));
    adminApi.getLoginActivity({ limit: 100 })
      .then(setActivity)
      .catch(() => {})
      .finally(() => setActivityLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FontAwesomeIcon icon={faShieldHalved} className="text-brand-600" /> Admin
        </h1>
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl" />)}
          </div>
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        </div>
      </div>
    );
  }

  const { totalFamilies = 0, activeFamilies = 0, families = [] } = dashboard || {};
  const flagCount = (activity?.suspiciousIps?.length || 0) + (activity?.highFreqIps?.length || 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FontAwesomeIcon icon={faShieldHalved} className="text-brand-600" /> Admin Dashboard
      </h1>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className={STAT_CARD}>
          <div className="text-3xl font-bold text-brand-600">{totalFamilies}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total Families</div>
        </div>
        <div className={STAT_CARD}>
          <div className="text-3xl font-bold text-green-600">{activeFamilies}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Active (30d)</div>
        </div>
        <div className={STAT_CARD}>
          <div className="text-3xl font-bold text-blue-600">{activity?.totalCount ?? '—'}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total Logins</div>
        </div>
        <div className={STAT_CARD}>
          <div className={`text-3xl font-bold ${flagCount > 0 ? 'text-amber-600' : 'text-green-600'}`}>
            {flagCount}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Security Flags</div>
        </div>
      </div>

      {/* ── Families Table ── */}
      <div className={CARD}>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <FontAwesomeIcon icon={faUsers} className="text-gray-400" /> Families
        </h2>
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                <th className="px-5 py-2">Status</th>
                <th className="px-3 py-2">Family</th>
                <th className="px-3 py-2 text-center">Parents</th>
                <th className="px-3 py-2 text-center">Kids</th>
                <th className="px-3 py-2 text-center">Logins/7d</th>
                <th className="px-3 py-2 text-center hidden sm:table-cell">Per Kid/7d</th>
                <th className="px-3 py-2">Last Login</th>
                <th className="px-3 py-2 hidden sm:table-cell">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {families.map(f => {
                const perKid = f.kid_count > 0 ? (f.logins_last_7d / f.kid_count).toFixed(1) : '—';
                const isExpanded = expandedFamily === f.id;
                const handleToggle = () => {
                  if (isExpanded) {
                    setExpandedFamily(null);
                    setFamilyDetail(null);
                  } else {
                    setExpandedFamily(f.id);
                    setFamilyDetail(null);
                    setFamilyDetailLoading(true);
                    adminApi.getFamilyDetail(f.id)
                      .then(setFamilyDetail)
                      .catch(() => {})
                      .finally(() => setFamilyDetailLoading(false));
                  }
                };
                return (
                  <Fragment key={f.id}>
                    <tr
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                      onClick={handleToggle}
                    >
                      <td className="px-5 py-2.5">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${activityColor(f.last_login)}`} />
                      </td>
                      <td className="px-3 py-2.5 font-medium">
                        {f.family_name}
                        <FontAwesomeIcon icon={isExpanded ? faChevronUp : faChevronDown} className="ml-2 text-gray-400 text-[10px]" />
                      </td>
                      <td className="px-3 py-2.5 text-center">{f.parent_count}</td>
                      <td className="px-3 py-2.5 text-center">{f.kid_count}</td>
                      <td className="px-3 py-2.5 text-center font-mono">{f.logins_last_7d}</td>
                      <td className="px-3 py-2.5 text-center font-mono hidden sm:table-cell">{perKid}</td>
                      <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400">{timeAgo(f.last_login)}</td>
                      <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                        {f.created_at ? new Date(f.created_at.endsWith('Z') ? f.created_at : f.created_at + 'Z').toLocaleDateString() : '—'}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="bg-gray-50 dark:bg-gray-900/50 px-5 py-4">
                          {familyDetailLoading ? (
                            <div className="animate-pulse space-y-2">
                              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                            </div>
                          ) : familyDetail ? (
                            <div className="space-y-4">
                              {/* Members */}
                              <div>
                                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Members</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                  {familyDetail.members.map(m => (
                                    <div key={m.id} className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium text-sm truncate">{m.name}</span>
                                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                            m.role === 'parent'
                                              ? 'bg-brand-50 dark:bg-brand-500/20 text-brand-700 dark:text-brand-400'
                                              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                          }`}>{m.role}</span>
                                          {!m.is_active && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">Inactive</span>}
                                        </div>
                                        <div className="text-xs text-gray-400 mt-0.5">
                                          {m.logins_7d} logins/7d &middot; Last: {timeAgo(m.last_login)}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {/* Recent logins for this family */}
                              {familyDetail.recentLogins.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Recent Logins</h4>
                                  <div className="space-y-1">
                                    {familyDetail.recentLogins.map((l, i) => (
                                      <div key={i} className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                                        <span className="w-24 shrink-0">{timeAgo(l.created_at)}</span>
                                        <span className="font-medium text-gray-700 dark:text-gray-300">{l.user_name}</span>
                                        <span className="hidden sm:inline">{parseUA(l.user_agent)}</span>
                                        <span className="font-mono text-[11px] hidden md:inline">{l.ip_address || '—'}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400">Failed to load details</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {families.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-gray-400">No families found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Security Flags ── */}
      {!activityLoading && (
        <div className={`${CARD} ${flagCount > 0 ? 'border-amber-300 dark:border-amber-600' : ''}`}>
          <h2 className={`text-lg font-semibold mb-1 flex items-center gap-2 ${flagCount > 0 ? 'text-amber-600' : ''}`}>
            <FontAwesomeIcon icon={faTriangleExclamation} /> Security Flags
          </h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
            Monitors for shared IPs across families (credential stuffing / account probing) and unusually high login volume (bots / brute force).
          </p>

          {/* Cross-family IPs */}
          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
              Cross-family IPs
            </h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
              Same IP logging into more than one family in the last 30 days. Could indicate shared networks (harmless) or someone probing multiple accounts.
            </p>
            {activity?.suspiciousIps?.length > 0 ? (
              <div className="space-y-1">
                {activity.suspiciousIps.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                    <span className="font-mono text-xs">{s.ip_address}</span>
                    <span className="text-gray-500">{s.family_count} families</span>
                    <span className="text-gray-500">{s.login_count} logins</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-green-600 dark:text-green-400">None detected</p>
            )}
          </div>

          {/* High-frequency IPs */}
          <div>
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
              High-frequency IPs
            </h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
              IPs with 20+ logins in the last 24 hours. Could indicate bots, brute-force attempts, or automated scraping.
            </p>
            {activity?.highFreqIps?.length > 0 ? (
              <div className="space-y-1">
                {activity.highFreqIps.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                    <span className="font-mono text-xs">{s.ip_address}</span>
                    <span className="text-gray-500">{s.login_count} logins</span>
                    <span className="text-gray-500">{s.user_count} users</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-green-600 dark:text-green-400">None detected</p>
            )}
          </div>
        </div>
      )}

      {/* ── Recent Login Activity ── */}
      <div className={CARD}>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <FontAwesomeIcon icon={faArrowRightToBracket} className="text-gray-400" /> Recent Logins
        </h2>
        {activityLoading ? (
          <div className="animate-pulse space-y-2">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-8 bg-gray-200 dark:bg-gray-700 rounded" />)}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                    <th className="px-5 py-2">Time</th>
                    <th className="px-3 py-2">User</th>
                    <th className="px-3 py-2">Family</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2 hidden sm:table-cell">Device</th>
                    <th className="px-3 py-2 hidden md:table-cell">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {(showAllLogs ? activity?.logs : activity?.logs?.slice(0, 25))?.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-5 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{timeAgo(log.created_at)}</td>
                      <td className="px-3 py-2 font-medium">{log.user_name}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{log.family_name}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          log.role === 'parent'
                            ? 'bg-brand-50 dark:bg-brand-500/20 text-brand-700 dark:text-brand-400'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                        }`}>
                          {log.role}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400 hidden sm:table-cell">{parseUA(log.user_agent)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-400 hidden md:table-cell">{log.ip_address || '—'}</td>
                    </tr>
                  ))}
                  {(!activity?.logs || activity.logs.length === 0) && (
                    <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">No login activity yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {activity?.logs?.length > 25 && !showAllLogs && (
              <button
                onClick={() => setShowAllLogs(true)}
                className="mt-3 text-sm text-brand-600 hover:text-brand-700 font-medium"
              >
                Show all {activity.logs.length} entries
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
