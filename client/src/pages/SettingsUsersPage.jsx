import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilySettings } from '../context/FamilySettingsContext.jsx';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { familyApi } from '../api/family.api.js';
import Avatar from '../components/shared/Avatar.jsx';
import Modal from '../components/shared/Modal.jsx';
import EmojiPicker from '../components/shared/EmojiPicker.jsx';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import { AVATAR_COLORS } from '../utils/constants.js';

const FORM_EMOJIS = [
  '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼',
  '🐨','🐯','🦁','🐸','🐵','🦄','🐧','🐢',
  '🦖','🦕','🐬','🦈','🦋','🐙','🌟','⭐',
  '🌈','☀️','🌙','🌺','🌻','🌊','🍕','🍦',
  '🍩','🍎','🎮','⚽','🏀','🎸','🚀','🎨',
];

function AddUserForm({ onSave, onCancel, loading }) {
  const [role, setRole] = useState('kid');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [allowLogin, setAllowLogin] = useState(false);
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [avatarEmoji, setAvatarEmoji] = useState(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const data = role === 'kid'
        ? { role: 'kid', name, allowLogin, ...(allowLogin ? { username, pin } : {}), avatarColor, avatarEmoji }
        : { role: 'parent', name, email, password, avatarColor, avatarEmoji };
      await onSave(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add user.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
        <select value={role} onChange={(e) => setRole(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-200">
          <option value="kid">Kid</option>
          <option value="parent">Parent</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-200" />
      </div>
      {role === 'kid' ? (
        <>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Allow login for child</label>
            <button
              type="button"
              role="switch"
              aria-checked={allowLogin}
              onClick={() => setAllowLogin(!allowLogin)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
                allowLogin ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                allowLogin ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
          {allowLogin && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-200" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">PIN (4 digits)</label>
                <input type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  required maxLength={4} placeholder="••••"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-200" />
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-200" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-200" />
          </div>
        </>
      )}

      {/* Avatar preview + color + emoji */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Avatar</label>
        <div className="flex items-start gap-4">
          {/* Live preview */}
          <div className="flex-shrink-0">
            <Avatar name={name || '?'} color={avatarColor} emoji={avatarEmoji} size="lg" />
          </div>
          <div className="flex-1 space-y-2">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Color</p>
              <div className="flex gap-1.5 flex-wrap">
                {AVATAR_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setAvatarColor(c)}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${avatarColor === c ? 'border-gray-800 scale-125' : 'border-transparent hover:scale-110'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Emoji <span className="text-gray-400 dark:text-gray-500">(optional)</span></p>
              <div className="grid grid-cols-10 gap-1">
                {FORM_EMOJIS.map((e) => (
                  <button key={e} type="button" onClick={() => setAvatarEmoji(avatarEmoji === e ? null : e)}
                    className={`w-8 h-8 rounded-md flex items-center justify-center text-base hover:bg-brand-50 transition-colors ${
                      e === avatarEmoji ? 'bg-brand-100 ring-2 ring-brand-400' : ''
                    }`}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={loading}
          className="flex-1 bg-brand-500 hover:bg-brand-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {loading ? 'Adding…' : 'Add Member'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
          Cancel
        </button>
      </div>
    </form>
  );
}

function SortableMemberRow({ member, onNavigate, onDeactivate, onEmojiClick }) {
  const { useTickets } = useFamilySettings();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: member.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onNavigate(`/settings/users/${member.id}`)}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm cursor-pointer hover:border-brand-300 dark:hover:border-brand-500/50 transition-colors"
    >
      {/* Row 1: drag handle + avatar + name */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button
          {...attributes}
          {...listeners}
          className="touch-none text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 cursor-grab active:cursor-grabbing flex-shrink-0"
          aria-label="Drag to reorder"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm6 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 10a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm6 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 16a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm6 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEmojiClick(member); }}
          className="flex-shrink-0 rounded-full hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-brand-400"
          title="Change avatar emoji"
        >
          <Avatar name={member.name} color={member.avatar_color} emoji={member.avatar_emoji} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{member.name}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 capitalize">
            {member.role} · {member.email || member.username || '—'}
          </p>
        </div>
      </div>

      {/* Right: kid info + deactivate + chevron */}
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
        {!member.is_active && (
          <span className="text-xs font-medium text-red-400 dark:text-red-500">Inactive</span>
        )}
        {member.role === 'kid' && !!member.is_active && (
          <>
            {useTickets && (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                🎟 {member.daily_ticket_potential ?? 0}/day
              </span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onNavigate(`/settings/chores/${member.id}`); }}
              className="hidden lg:inline-flex text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors"
            >
              Chores
            </button>
          </>
        )}
        {!!member.is_active && (
          <button
            onClick={(e) => { e.stopPropagation(); onDeactivate(member.id); }}
            className="hidden lg:inline-flex text-xs font-medium px-2.5 py-1 rounded-md border border-red-200 dark:border-red-500/40 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            Deactivate
          </button>
        )}
        <span className="text-gray-300 dark:text-gray-600">›</span>
      </div>
    </div>
  );
}

export default function SettingsUsersPage() {
  const navigate = useNavigate();
  const { user, patchUser } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [error, setError] = useState('');
  const [emojiFor, setEmojiFor] = useState(null); // member being edited

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchMembers = async () => {
    try {
      const data = await familyApi.getFamily();
      const sorted = [...data.members].sort((a, b) => {
        const aOrd = a.sort_order ?? 0;
        const bOrd = b.sort_order ?? 0;
        if (aOrd !== bOrd) return aOrd - bOrd;
        return a.name.localeCompare(b.name);
      });
      setMembers(sorted);
    } catch {
      setError('Failed to load members.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMembers(); }, []);

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = members.findIndex((m) => m.id === active.id);
    const newIndex = members.findIndex((m) => m.id === over.id);
    const reordered = arrayMove(members, oldIndex, newIndex);
    setMembers(reordered);

    try {
      await familyApi.reorderUsers(reordered.map((m) => m.id));
    } catch {
      setError('Failed to save order. Please try again.');
      fetchMembers();
    }
  };

  const handleAdd = async (data) => {
    setAddLoading(true);
    try {
      await familyApi.addUser(data);
      setAddModal(false);
      fetchMembers();
    } catch (err) {
      throw err;
    } finally {
      setAddLoading(false);
    }
  };

  const handleDeactivate = async (id) => {
    if (!confirm('Deactivate this member?')) return;
    await familyApi.deactivateUser(id);
    fetchMembers();
  };

  const handleEmojiPick = async (emoji) => {
    if (!emojiFor) return;
    const id = emojiFor.id;
    setMembers((prev) => prev.map((m) => m.id === id ? { ...m, avatar_emoji: emoji } : m));
    if (id === user?.id) patchUser({ avatarEmoji: emoji });
    try {
      await familyApi.updateEmoji(id, emoji);
    } catch {
      setError('Failed to update avatar.');
      fetchMembers();
    }
  };

  const handleColorPick = async (color) => {
    if (!emojiFor) return;
    const id = emojiFor.id;
    setEmojiFor((prev) => prev ? { ...prev, avatar_color: color } : prev);
    setMembers((prev) => prev.map((m) => m.id === id ? { ...m, avatar_color: color } : m));
    if (id === user?.id) patchUser({ avatarColor: color });
    try {
      await familyApi.updateColor(id, color);
    } catch {
      setError('Failed to update color.');
      fetchMembers();
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            <FontAwesomeIcon icon={faUsers} className="mr-2 text-brand-500" />
            Family &amp; Chores
          </h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">Drag to set the display order</p>
        </div>
        <button onClick={() => setAddModal(true)}
          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm rounded-lg font-medium transition-colors">
          + Add Member
        </button>
      </div>

      {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}

      {loading ? <LoadingSkeleton rows={3} /> : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={members.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {members.map((m) => (
                <SortableMemberRow
                  key={m.id}
                  member={m}
                  onNavigate={navigate}
                  onDeactivate={handleDeactivate}
                  onEmojiClick={setEmojiFor}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Family Member">
        <AddUserForm onSave={handleAdd} onCancel={() => setAddModal(false)} loading={addLoading} />
      </Modal>

      <EmojiPicker
        open={!!emojiFor}
        onClose={() => setEmojiFor(null)}
        onPickEmoji={handleEmojiPick}
        onPickColor={handleColorPick}
        currentEmoji={emojiFor?.avatar_emoji}
        currentColor={emojiFor?.avatar_color}
        previewName={emojiFor?.name}
      />
    </div>
  );
}
