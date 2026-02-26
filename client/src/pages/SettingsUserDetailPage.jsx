import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faListCheck, faPen, faTrash } from '@fortawesome/free-solid-svg-icons';
import { familyApi } from '../api/family.api.js';
import { useFamilySettings } from '../context/FamilySettingsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/shared/Avatar.jsx';
import EmojiPicker from '../components/shared/EmojiPicker.jsx';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
        checked ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`} />
    </button>
  );
}

export default function SettingsUserDetailPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user: authUser, patchUser } = useAuth();
  const { useBanking, useTickets } = useFamilySettings();

  const [member,          setMember]          = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState('');
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [editingName,     setEditingName]     = useState(false);
  const [nameInput,       setNameInput]       = useState('');
  const [nameSaving,      setNameSaving]      = useState(false);
  const [deleteModal,     setDeleteModal]     = useState(false);
  const [deleteConfirm,   setDeleteConfirm]   = useState('');
  const [deleting,        setDeleting]        = useState(false);
  const nameInputRef = useRef(null);

  useEffect(() => {
    familyApi.getFamily()
      .then(({ members }) => {
        const found = members.find((m) => String(m.id) === String(userId));
        if (found) setMember(found);
        else setError('Member not found.');
      })
      .catch(() => setError('Failed to load member.'))
      .finally(() => setLoading(false));
  }, [userId]);

  // Focus the name input when editing starts
  useEffect(() => {
    if (editingName) nameInputRef.current?.select();
  }, [editingName]);

  const handleToggle = async (field, value) => {
    setMember((prev) => ({ ...prev, [field]: value ? 1 : 0 }));
    try {
      await familyApi.updateUser(Number(userId), { [field]: value });
    } catch {
      setError('Failed to save setting.');
      setMember((prev) => ({ ...prev, [field]: value ? 0 : 1 }));
    }
  };

  const handleEmojiPick = async (emoji) => {
    setMember((prev) => ({ ...prev, avatar_emoji: emoji }));
    if (Number(userId) === authUser?.id) patchUser({ avatarEmoji: emoji });
    try {
      await familyApi.updateEmoji(Number(userId), emoji);
    } catch {
      setError('Failed to update avatar.');
    }
  };

  const handleColorPick = async (color) => {
    setMember((prev) => ({ ...prev, avatar_color: color }));
    if (Number(userId) === authUser?.id) patchUser({ avatarColor: color });
    try {
      await familyApi.updateColor(Number(userId), color);
    } catch {
      setError('Failed to update color.');
    }
  };

  const startEditName = () => {
    setNameInput(member.name);
    setEditingName(true);
  };

  const cancelEditName = () => setEditingName(false);

  const saveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === member.name) { setEditingName(false); return; }
    setNameSaving(true);
    try {
      await familyApi.updateUser(Number(userId), { name: trimmed });
      setMember((prev) => ({ ...prev, name: trimmed }));
      if (Number(userId) === authUser?.id) patchUser({ name: trimmed });
      setEditingName(false);
    } catch {
      setError('Failed to save name.');
    } finally {
      setNameSaving(false);
    }
  };

  const handleNameKeyDown = (e) => {
    if (e.key === 'Enter')  saveName();
    if (e.key === 'Escape') cancelEditName();
  };

  const handleDelete = async () => {
    if (deleteConfirm !== 'YES') return;
    setDeleting(true);
    try {
      await familyApi.deleteUserPermanently(Number(userId));
      navigate('/settings/users');
    } catch {
      setError('Failed to delete user. Please try again.');
      setDeleteModal(false);
      setDeleting(false);
    }
  };

  if (loading) return (
    <div>
      <button onClick={() => navigate('/settings/users')} className="mb-4 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-brand-500 transition-colors">
        <FontAwesomeIcon icon={faChevronLeft} className="text-xs" /> Back
      </button>
      <LoadingSkeleton rows={3} />
    </div>
  );

  if (error || !member) return (
    <div>
      <button onClick={() => navigate('/settings/users')} className="mb-4 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-brand-500 transition-colors">
        <FontAwesomeIcon icon={faChevronLeft} className="text-xs" /> Back
      </button>
      <p className="text-red-500 text-sm">{error || 'Member not found.'}</p>
    </div>
  );

  const isKid = member.role === 'kid';

  const toggles = [
    {
      field:       'show_on_dashboard',
      label:       'Show on Dashboard',
      description: isKid
        ? `Show ${member.name} on the family dashboard.`
        : 'Display this parent on the family dashboard.',
    },
    useBanking && {
      field:       'show_balance_on_dashboard',
      label:       'Show Balance on Dashboard',
      description: isKid
        ? `Display ${member.name}'s bank balance on the family dashboard.`
        : "Display this parent's bank balance on the family dashboard.",
    },
    isKid && {
      field:       'require_task_approval',
      label:       'Require Task Approval',
      description: "Kids can check off chores and steps but they'll show up under the parent's inbox before tickets are awarded.",
    },
  ].filter(Boolean);

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/settings/users')}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Back"
        >
          <FontAwesomeIcon icon={faChevronLeft} />
        </button>

        {/* Clickable avatar → opens emoji/color picker */}
        <button
          type="button"
          onClick={() => setEmojiPickerOpen(true)}
          className="flex-shrink-0 rounded-full hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-brand-400"
          title="Change avatar"
        >
          <Avatar name={member.name} color={member.avatar_color} emoji={member.avatar_emoji} size="lg" />
        </button>

        {/* Name — inline editable */}
        <div className="min-w-0 flex-1">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                ref={nameInputRef}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={handleNameKeyDown}
                onBlur={saveName}
                disabled={nameSaving}
                className="text-2xl font-bold text-gray-900 dark:text-gray-100 bg-transparent border-b-2 border-brand-400 focus:outline-none w-full min-w-0 disabled:opacity-50"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">{member.name}</h1>
              <button
                onClick={startEditName}
                className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-brand-600 dark:hover:text-brand-400 transition-all"
                title="Edit name"
              >
                <FontAwesomeIcon icon={faPen} className="text-xs" />
              </button>
            </div>
          )}
          <p className="text-sm text-gray-400 dark:text-gray-500 capitalize">{member.role}</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {/* ── Display toggles ── */}
      {toggles.length > 0 && (
        <div className="mb-6 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1">Display</h2>
          {toggles.map(({ field, label, description }) => (
            <div
              key={field}
              className="flex items-start justify-between gap-6 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-gray-100">{label}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
              </div>
              <Toggle checked={!!member[field]} onChange={(v) => handleToggle(field, v)} />
            </div>
          ))}
        </div>
      )}

      {/* ── Cards ── */}
      {isKid && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1">Sections</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            <button
              onClick={() => navigate(`/settings/chores/${userId}`)}
              className="text-left p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-brand-300 dark:hover:border-brand-500/50 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-500/20 flex items-center justify-center text-brand-600 dark:text-brand-400">
                  <FontAwesomeIcon icon={faListCheck} />
                </span>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Chores</h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Manage {member.name}'s chore list and schedule.</p>
            </button>

            {useTickets && (
              <div className="p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 text-base leading-none">
                    🎟
                  </span>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Tickets / Day</h3>
                </div>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{member.daily_ticket_potential ?? 0}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Maximum tickets earnable per day from chores.</p>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Danger zone ── */}
      <div className="mt-10 pt-6 border-t border-gray-200 dark:border-gray-700">
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1 mb-3">Danger Zone</h2>
        <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800/50 rounded-xl">
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">Delete {member.name}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Permanently remove this user and all their data.</p>
          </div>
          <button
            onClick={() => { setDeleteConfirm(''); setDeleteModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
          >
            <FontAwesomeIcon icon={faTrash} className="text-xs" />
            Delete
          </button>
        </div>
      </div>

      {/* ── Delete confirmation modal ── */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !deleting && setDeleteModal(false)} />
          <div className="relative z-10 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">

            {/* Warning icon */}
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 mx-auto mb-4">
              <FontAwesomeIcon icon={faTrash} className="text-2xl text-red-600 dark:text-red-400" />
            </div>

            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 text-center mb-1">Delete {member.name}?</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-4">This cannot be undone.</p>

            {/* What gets deleted */}
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg p-3 mb-5 text-sm text-red-700 dark:text-red-300 space-y-1">
              <p className="font-semibold mb-1.5">Everything will be permanently deleted:</p>
              <p>· Chores and chore history</p>
              <p>· Bank accounts and all transactions</p>
              <p>· Tickets, ticket history, and reward redemptions</p>
              <p>· Task set assignments and completions</p>
              <p>· Activity feed entries</p>
            </div>

            {/* YES confirmation input */}
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Type <span className="font-bold text-red-600 dark:text-red-400">YES</span> to confirm
            </label>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="YES"
              disabled={deleting}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mb-4 disabled:opacity-50"
            />

            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={deleteConfirm !== 'YES' || deleting}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 dark:disabled:bg-red-900/40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
              <button
                onClick={() => setDeleteModal(false)}
                disabled={deleting}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <EmojiPicker
        open={emojiPickerOpen}
        onClose={() => setEmojiPickerOpen(false)}
        onPickEmoji={handleEmojiPick}
        onPickColor={handleColorPick}
        currentEmoji={member.avatar_emoji}
        currentColor={member.avatar_color}
        previewName={member.name}
      />
    </div>
  );
}
