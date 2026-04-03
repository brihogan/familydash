import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faCheck, faGripVertical, faTrash, faBan, faPlus, faPen } from '@fortawesome/free-solid-svg-icons';
import { turnsApi } from '../api/turns.api.js';
import Avatar from '../components/shared/Avatar.jsx';

export default function TurnDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [turn, setTurn] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const dragItem = useRef(null);
  const dragOver = useRef(null);

  const load = useCallback(async () => {
    try {
      const turnData = await turnsApi.getTurn(id);
      setTurn(turnData);
      setMembers(turnData.members);
    } catch { /* ignore */ }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const activeMembers = members.filter((m) => !m.excluded);
  const excludedMembers = members.filter((m) => m.excluded);

  const save = async (overrides = {}) => {
    setSaving(true);
    try {
      const payload = {
        name: overrides.name ?? turn.name,
        visibility: overrides.visibility ?? turn.visibility,
        members: (overrides.members ?? members).map((m, i) => ({
          user_id: m.user_id,
          position: i,
          is_current: !!m.is_current,
          excluded: !!m.excluded,
        })),
      };
      const updated = await turnsApi.updateTurn(id, payload);
      setTurn(updated);
      setMembers(updated.members);
      setDirty(false);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleVisibilityChange = (vis) => {
    setTurn((prev) => ({ ...prev, visibility: vis }));
    save({ visibility: vis });
  };

  const handleNameSave = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === turn.name) { setEditingName(false); return; }
    setTurn((prev) => ({ ...prev, name: trimmed }));
    setEditingName(false);
    save({ name: trimmed });
  };

  const handleSetCurrent = (userId) => {
    const updated = members.map((m) => ({
      ...m,
      is_current: m.user_id === userId ? 1 : 0,
    }));
    setMembers(updated);
    setDirty(true);
  };

  const handleExclude = (userId) => {
    const updated = members.map((m) =>
      m.user_id === userId ? { ...m, excluded: 1, is_current: 0 } : m,
    );
    // If we excluded the current person, assign current to the first active
    const hasActive = updated.some((m) => !m.excluded && m.is_current);
    if (!hasActive) {
      const firstActive = updated.find((m) => !m.excluded);
      if (firstActive) firstActive.is_current = 1;
    }
    setMembers(updated);
    setDirty(true);
  };

  const handleInclude = (userId) => {
    const updated = members.map((m) =>
      m.user_id === userId ? { ...m, excluded: 0 } : m,
    );
    setMembers(updated);
    setDirty(true);
  };

  // Drag reorder
  const handleDragStart = (index) => { dragItem.current = index; };
  const handleDragEnter = (index) => { dragOver.current = index; };
  const handleDragEnd = () => {
    if (dragItem.current === null || dragOver.current === null) return;
    // Only reorder within the active list
    const active = members.filter((m) => !m.excluded);
    const excluded = members.filter((m) => m.excluded);
    const reordered = [...active];
    const [removed] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOver.current, 0, removed);
    dragItem.current = null;
    dragOver.current = null;
    setMembers([...reordered, ...excluded]);
    setDirty(true);
  };

  // Touch drag support
  const touchIdx = useRef(null);
  const listRef = useRef(null);

  const handleTouchStart = (index, e) => {
    touchIdx.current = index;
  };

  const handleTouchMove = (e) => {
    if (touchIdx.current === null || !listRef.current) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    const items = listRef.current.querySelectorAll('[data-member-row]');
    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) {
        dragOver.current = i;
        break;
      }
    }
  };

  const handleTouchEnd = () => {
    if (touchIdx.current === null || dragOver.current === null) { touchIdx.current = null; return; }
    const active = members.filter((m) => !m.excluded);
    const excluded = members.filter((m) => m.excluded);
    const reordered = [...active];
    const [removed] = reordered.splice(touchIdx.current, 1);
    reordered.splice(dragOver.current, 0, removed);
    touchIdx.current = null;
    dragOver.current = null;
    setMembers([...reordered, ...excluded]);
    setDirty(true);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this turn?')) return;
    try {
      await turnsApi.deleteTurn(id);
      navigate('/settings/turns');
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        <div className="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
        <div className="space-y-2">
          {[1,2,3].map((i) => <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!turn) {
    return <p className="text-gray-500 dark:text-gray-400">Turn not found.</p>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/settings/turns')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0">
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
          {editingName ? (
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={(e) => { if (e.key === 'Enter') handleNameSave(); if (e.key === 'Escape') setEditingName(false); }}
              autoFocus
              className="text-2xl font-bold text-gray-900 dark:text-gray-100 bg-transparent border-b-2 border-brand-400 focus:outline-none min-w-0"
            />
          ) : (
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">{turn.name}</h1>
          )}
          {!editingName && (
            <button
              onClick={() => { setNameDraft(turn.name); setEditingName(true); }}
              className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 shrink-0"
            >
              <FontAwesomeIcon icon={faPen} className="text-sm" />
            </button>
          )}
        </div>
        <button
          onClick={handleDelete}
          className="w-9 h-9 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center justify-center transition-colors shrink-0"
        >
          <FontAwesomeIcon icon={faTrash} className="text-sm" />
        </button>
      </div>

      {/* Visibility */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-1">Show on Dashboard</label>
        <div className="flex gap-2">
          {[
            { value: 'everyone', label: 'Everyone' },
            { value: 'parents', label: 'Parents Only' },
            { value: 'self', label: 'Self Only' },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleVisibilityChange(opt.value)}
              className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
                turn.visibility === opt.value
                  ? 'bg-brand-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active members list */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-1">
          Order &amp; Current Turn
        </label>
        <div ref={listRef} className="space-y-1" onTouchMove={handleTouchMove}>
          {activeMembers.map((m, index) => (
            <div
              key={m.user_id}
              data-member-row
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              onTouchStart={(e) => handleTouchStart(index, e)}
              onTouchEnd={handleTouchEnd}
              className={`flex items-center gap-3 p-3 rounded-xl select-none transition-colors ${
                m.is_current
                  ? 'bg-brand-50 dark:bg-brand-500/10 border-2 border-brand-400 dark:border-brand-500'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <FontAwesomeIcon
                icon={faGripVertical}
                className="text-gray-300 dark:text-gray-600 cursor-grab active:cursor-grabbing"
              />
              <button
                onClick={() => handleSetCurrent(m.user_id)}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                <Avatar
                  name={m.name}
                  color={m.avatar_color}
                  emoji={m.avatar_emoji}
                  size="sm"
                />
                <span className="flex-1 text-left font-medium text-gray-900 dark:text-gray-100">{m.name}</span>
                {m.is_current ? (
                  <span className="w-6 h-6 rounded-full bg-brand-500 text-white flex items-center justify-center shrink-0">
                    <FontAwesomeIcon icon={faCheck} className="text-xs" />
                  </span>
                ) : null}
              </button>
              <button
                onClick={() => handleExclude(m.user_id)}
                className="w-7 h-7 rounded-full text-gray-300 dark:text-gray-600 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center justify-center transition-colors shrink-0"
                title="Exclude"
              >
                <FontAwesomeIcon icon={faBan} className="text-xs" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Excluded members */}
      {excludedMembers.length > 0 && (
        <div className="mb-6">
          <label className="block text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-1">
            Excluded
          </label>
          <div className="space-y-1">
            {excludedMembers.map((m) => (
              <div
                key={m.user_id}
                className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 opacity-60"
              >
                <Avatar
                  name={m.name}
                  color={m.avatar_color}
                  emoji={m.avatar_emoji}
                  size="sm"
                />
                <span className="flex-1 font-medium text-gray-500 dark:text-gray-400">{m.name}</span>
                <button
                  onClick={() => handleInclude(m.user_id)}
                  className="w-7 h-7 rounded-full text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 flex items-center justify-center transition-colors shrink-0"
                  title="Include"
                >
                  <FontAwesomeIcon icon={faPlus} className="text-xs" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save button (visible when dirty) */}
      {dirty && (
        <div className="sticky bottom-4">
          <button
            onClick={() => save()}
            disabled={saving}
            className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors shadow-lg"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  );
}
