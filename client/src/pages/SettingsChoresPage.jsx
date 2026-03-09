import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBroom, faChevronLeft } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../context/AuthContext.jsx';
import { choresApi } from '../api/chores.api.js';
import { familyApi } from '../api/family.api.js';
import ChoreTemplateList from '../components/chores/ChoreTemplateList.jsx';
import ChoreTemplateForm from '../components/chores/ChoreTemplateForm.jsx';
import Modal from '../components/shared/Modal.jsx';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';

// Bitmask convention: Mon=1, Tue=2, Wed=4, Thu=8, Fri=16, Sat=32, Sun=64
const DAYS = [
  { label: 'Mo', bit: 1  },
  { label: 'Tu', bit: 2  },
  { label: 'We', bit: 4  },
  { label: 'Th', bit: 8  },
  { label: 'Fr', bit: 16 },
  { label: 'Sa', bit: 32 },
  { label: 'Su', bit: 64 },
];

// Maps JS Date.getDay() (0=Sun … 6=Sat) to bitmask
const DOW_BITS = [64, 1, 2, 4, 8, 16, 32];
const todayBit = DOW_BITS[new Date().getDay()];

export default function SettingsChoresPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEveryone = !userId;

  // ── Per-kid state ─────────────────────────────────────────────────────────
  const [templates,    setTemplates]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [addModal,     setAddModal]     = useState(false);
  const [editTemplate, setEditTemplate] = useState(null);
  const [formLoading,  setFormLoading]  = useState(false);
  const [error,        setError]        = useState('');
  const [selectedDay,  setSelectedDay]  = useState(null); // null = all week
  const [kids,         setKids]         = useState([]);
  const [kidName,      setKidName]      = useState('');

  // ── Batch select state ────────────────────────────────────────────────────
  const [selectMode,   setSelectMode]   = useState(false);
  const [selectedIds,  setSelectedIds]  = useState(new Set());
  const [batchSuccess, setBatchSuccess] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);

  // ── Everyone view state ───────────────────────────────────────────────────
  const [allKidsTemplates, setAllKidsTemplates] = useState({}); // { kidId: templates[] }
  const [everyoneLoading,  setEveryoneLoading]  = useState(false);

  const fetchTemplates = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const data = await choresApi.getTemplates(userId);
      setTemplates(data.templates);
    } catch {
      setError('Failed to load chore templates.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    fetchTemplates();
  }, [fetchTemplates]);

  // Clear select state when switching kids
  useEffect(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setBatchSuccess('');
  }, [userId]);

  // Fetch family for kid switcher (parent only)
  useEffect(() => {
    if (user?.role !== 'parent') return;
    familyApi.getFamily().then((data) => {
      const allKids = (data.members || []).filter((m) => (m.role === 'kid' || !!m.chores_enabled) && m.is_active !== 0);
      setKids(allKids);
      if (userId) {
        const match = allKids.find((k) => String(k.id) === String(userId));
        if (match) setKidName(match.name);
      } else {
        setKidName('');
      }
    }).catch(() => {});
  }, [userId, user?.role]);

  // Fetch all kids' templates for Everyone view
  useEffect(() => {
    if (!isEveryone || kids.length === 0) return;
    setEveryoneLoading(true);
    Promise.all(
      kids.map(async (k) => {
        const data = await choresApi.getTemplates(k.id);
        return [k.id, data.templates];
      })
    )
      .then((results) => setAllKidsTemplates(Object.fromEntries(results)))
      .catch(() => setError('Failed to load templates.'))
      .finally(() => setEveryoneLoading(false));
  }, [isEveryone, kids]);

  const handleAdd = async ({ copyToAll, ...choreData }) => {
    setFormLoading(true);
    try {
      if (copyToAll && kids.length > 0) {
        await Promise.all(kids.map((k) => choresApi.createTemplate(k.id, choreData)));
      } else {
        await choresApi.createTemplate(userId, choreData);
      }
      setAddModal(false);
      fetchTemplates();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add chore.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = async (data) => {
    setFormLoading(true);
    try {
      await choresApi.updateTemplate(userId, editTemplate.id, data);
      setEditTemplate(null);
      fetchTemplates();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update chore.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (templateId) => {
    if (!confirm('Delete this chore?')) return;
    await choresApi.deleteTemplate(userId, templateId);
    fetchTemplates();
  };

  // ── Batch actions ─────────────────────────────────────────────────────────

  const otherKids = kids.filter((k) => String(k.id) !== String(userId));

  const toggleSelectMode = () => {
    setSelectMode((p) => !p);
    setSelectedIds(new Set());
    setBatchSuccess('');
  };

  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBatchDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} chore${selectedIds.size !== 1 ? 's' : ''}?`)) return;
    setBatchLoading(true);
    try {
      await Promise.all([...selectedIds].map((id) => choresApi.deleteTemplate(userId, id)));
      setSelectedIds(new Set());
      setSelectMode(false);
      fetchTemplates();
    } catch {
      setError('Failed to delete selected chores.');
    } finally {
      setBatchLoading(false);
    }
  };

  const handleBatchCopy = async (targetKidId) => {
    const targetKid = kids.find((k) => String(k.id) === String(targetKidId));
    const toCopy = templates.filter((t) => selectedIds.has(t.id));
    setBatchLoading(true);
    try {
      await Promise.all(toCopy.map((t) => choresApi.createTemplate(targetKidId, {
        name:          t.name,
        description:   t.description,
        ticket_reward: t.ticket_reward,
        days_of_week:  t.days_of_week,
      })));
      setBatchSuccess(`Copied ${toCopy.length} chore${toCopy.length !== 1 ? 's' : ''} to ${targetKid?.name}.`);
      setSelectedIds(new Set());
      setSelectMode(false);
      setTimeout(() => setBatchSuccess(''), 4000);
    } catch {
      setError('Failed to copy chores.');
    } finally {
      setBatchLoading(false);
    }
  };

  const handleReorder = async (reorderedItems) => {
    const sorted = [...templates].sort((a, b) => a.sort_order - b.sort_order);
    const visibleIds = reorderedItems.map((i) => i.id);
    const visibleIdSet = new Set(visibleIds);

    const slotIndices = [];
    sorted.forEach((t, idx) => {
      if (visibleIdSet.has(t.id)) slotIndices.push(idx);
    });

    const idMap = Object.fromEntries(sorted.map((t) => [t.id, t]));
    const newSorted = [...sorted];
    slotIndices.forEach((slotIdx, i) => {
      newSorted[slotIdx] = idMap[visibleIds[i]];
    });

    const allUpdated = newSorted.map((t, i) => ({ ...t, sort_order: i }));
    setTemplates(allUpdated);
    await choresApi.reorderTemplates(userId, allUpdated.map((t) => ({ id: t.id, sort_order: t.sort_order })));
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  // Helpers for Everyone view ticket counts
  const kidDayPotential = (kidTemplates, bit) => {
    const activeT = kidTemplates.filter((t) => t.is_active !== 0);
    return activeT.filter((t) => (t.days_of_week & bit) !== 0).reduce((s, t) => s + (t.ticket_reward || 0), 0);
  };
  const kidWeeklyTotal = (kidTemplates) =>
    DAYS.reduce((s, d) => s + kidDayPotential(kidTemplates, d.bit), 0);

  const active = templates.filter((t) => t.is_active !== 0);
  const dayPotential = (bit) =>
    active.filter((t) => (t.days_of_week & bit) !== 0).reduce((s, t) => s + (t.ticket_reward || 0), 0);
  const weeklyTotal = DAYS.reduce((s, d) => s + dayPotential(d.bit), 0);

  const visibleTemplates = selectedDay === null
    ? templates
    : templates.filter((t) => (t.days_of_week & selectedDay) !== 0);

  // ── Shared day-filter bar ─────────────────────────────────────────────────

  const DayFilter = ({ showCounts }) => (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 mb-4 shadow-sm">
      {showCounts && (
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Daily Potential
          <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">click a day to filter</span>
        </h2>
      )}
      {!showCounts && (
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Filter by day
          <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">click a day to filter</span>
        </h2>
      )}
      {showCounts && active.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 italic">No active chores configured.</p>
      ) : (
        <div className="flex gap-1.5">
          <button
            onClick={() => setSelectedDay(null)}
            className={`flex-1 text-center rounded-lg py-2 px-1 border transition-colors ${
              selectedDay === null
                ? 'bg-brand-500 border-brand-500 text-white'
                : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
            }`}
          >
            <p className="text-xs mb-0.5">All</p>
            {showCounts && <p className="text-xs font-semibold">🎟 {weeklyTotal}/wk</p>}
          </button>
          {DAYS.map((d) => {
            const isSelected = selectedDay === d.bit;
            const isToday    = d.bit === todayBit;
            return (
              <button
                key={d.bit}
                onClick={() => setSelectedDay(d.bit)}
                className={`flex-1 text-center rounded-lg py-2 px-1 border transition-colors ${
                  isSelected
                    ? 'bg-brand-500 border-brand-500 text-white'
                    : isToday
                      ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100 ring-2 ring-brand-400 ring-offset-1 dark:bg-amber-900/30 dark:border-amber-600/50 dark:text-amber-300 dark:hover:bg-amber-900/50 dark:ring-offset-gray-800'
                      : showCounts
                        ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:border-amber-700/40 dark:text-amber-300 dark:hover:bg-amber-900/50'
                        : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
              >
                <p className={`text-xs mb-0.5 ${isToday && !isSelected ? 'font-semibold' : ''}`}>{d.label}</p>
                {showCounts && <p className="text-xs font-semibold">🎟 {dayPotential(d.bit)}</p>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── Kid switcher (shared) ─────────────────────────────────────────────────

  const KidSwitcher = () => {
    if (kids.length === 0) return null;
    return (
      <div className="flex items-center gap-1.5 mt-1.5">
        <span className="text-xs text-gray-400 dark:text-gray-500">Switch to:</span>
        <select
          value={userId ?? ''}
          onChange={(e) => {
            if (e.target.value === '') navigate('/settings/chores');
            else navigate(`/settings/chores/${e.target.value}`);
          }}
          className="text-sm font-medium text-brand-600 border border-brand-200 rounded-lg px-2.5 py-1 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-300 cursor-pointer hover:border-brand-400 transition-colors"
        >
          <option value="">Everyone</option>
          {kids.map((k) => (
            <option key={k.id} value={k.id}>{k.name}</option>
          ))}
        </select>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            {!isEveryone && (
              <button
                onClick={() => navigate(`/settings/users/${userId}`)}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Back"
              >
                <FontAwesomeIcon icon={faChevronLeft} />
              </button>
            )}
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              <FontAwesomeIcon icon={faBroom} className="mr-2 text-brand-500" />
              {isEveryone
                ? 'Chore Templates — Everyone'
                : (kidName ? `${kidName}'s Chore Templates` : 'Chore Templates')}
            </h1>
          </div>
          <KidSwitcher />
        </div>

        {/* Per-kid actions only */}
        {!isEveryone && (
          <div className="flex items-center gap-2">
            {!selectMode && (
              <button
                onClick={() => setAddModal(true)}
                className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm rounded-lg font-medium transition-colors"
              >
                + Add Chore
              </button>
            )}
            {templates.length > 0 && (
              <button
                onClick={toggleSelectMode}
                className={`px-4 py-2 text-sm rounded-lg font-medium border transition-colors ${
                  selectMode
                    ? 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {selectMode ? 'Cancel' : 'Select'}
              </button>
            )}
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
      {batchSuccess && <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 rounded-lg px-4 py-3 mb-4 text-sm">{batchSuccess}</div>}

      {/* ── Everyone view ── */}
      {isEveryone && (
        <>
          <DayFilter showCounts={false} />
          {everyoneLoading ? (
            <LoadingSkeleton rows={4} />
          ) : (
            <div className="overflow-x-auto">
              <div className="flex gap-4" style={{ minWidth: kids.length > 0 ? `${kids.length * 200}px` : undefined }}>
                {kids.map((k) => {
                  const kidTemplates = allKidsTemplates[k.id] ?? [];
                  const visible = selectedDay === null
                    ? kidTemplates
                    : kidTemplates.filter((t) => (t.days_of_week & selectedDay) !== 0);
                  return (
                    <div key={k.id} className="flex-1 min-w-[176px]">
                      <div className="flex items-baseline gap-1.5 mb-2">
                        <Link
                          to={`/settings/chores/${k.id}`}
                          className="text-sm font-semibold text-brand-600 hover:text-brand-800 hover:underline"
                        >
                          {k.name} →
                        </Link>
                        <span className="text-xs text-amber-600 font-medium">
                          🎟 {selectedDay === null
                            ? `${kidWeeklyTotal(allKidsTemplates[k.id] ?? [])}/wk`
                            : `${kidDayPotential(allKidsTemplates[k.id] ?? [], selectedDay)}/day`}
                        </span>
                      </div>
                      {visible.length === 0 ? (
                        <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                          No chores{selectedDay !== null ? ' this day' : ''}.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {visible.map((t) => (
                            <div
                              key={t.id}
                              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 shadow-sm"
                            >
                              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug">{t.name}</p>
                              {t.description && (
                                <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{t.description}</p>
                              )}
                              <span className="text-xs bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded-full mt-1.5 inline-block">
                                🎟 {t.ticket_reward}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Per-kid view ── */}
      {!isEveryone && (
        <>
          {/* Batch action bar */}
          {selectMode && (
            <div className="flex items-center gap-2 mb-4 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-700 rounded-lg px-4 py-2.5">
              <span className="text-sm text-brand-700 font-medium flex-1">
                {selectedIds.size === 0 ? 'Select chores below' : `${selectedIds.size} selected`}
              </span>
              {selectedIds.size > 0 && (
                <>
                  <button
                    onClick={handleBatchDelete}
                    disabled={batchLoading}
                    className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    Delete
                  </button>
                  {otherKids.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => { if (e.target.value) handleBatchCopy(e.target.value); }}
                      disabled={batchLoading}
                      className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent disabled:opacity-50"
                    >
                      <option value="">Copy to…</option>
                      {otherKids.map((k) => (
                        <option key={k.id} value={k.id}>{k.name}</option>
                      ))}
                    </select>
                  )}
                </>
              )}
            </div>
          )}

          {/* Daily Potential / Day filter */}
          {!loading && <DayFilter showCounts={true} />}

          {loading ? (
            <LoadingSkeleton rows={4} />
          ) : (
            <ChoreTemplateList
              templates={visibleTemplates}
              onReorder={handleReorder}
              onEdit={setEditTemplate}
              onDelete={handleDelete}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
            />
          )}

          <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Chore">
            <ChoreTemplateForm
              onSave={handleAdd}
              onCancel={() => setAddModal(false)}
              loading={formLoading}
              showCopyToggle={kids.length > 1}
            />
          </Modal>

          <Modal open={!!editTemplate} onClose={() => setEditTemplate(null)} title="Edit Chore">
            <ChoreTemplateForm
              initial={editTemplate}
              onSave={handleEdit}
              onCancel={() => setEditTemplate(null)}
              loading={formLoading}
            />
          </Modal>
        </>
      )}
    </div>
  );
}
