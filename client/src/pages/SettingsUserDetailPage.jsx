import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faListCheck, faPen, faTrash, faKey, faCircleCheck, faCoins } from '@fortawesome/free-solid-svg-icons';
import Modal from '../components/shared/Modal.jsx';
import { familyApi } from '../api/family.api.js';
import { claudeApi } from '../api/claude.api.js';
import { useFamilySettings } from '../context/FamilySettingsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/shared/Avatar.jsx';
import EmojiPicker from '../components/shared/EmojiPicker.jsx';
import useScrollLock from '../hooks/useScrollLock.js';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import { BADGE_LEVELS } from '../constants/badgeLevels.js';

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

// Reset-container helper card — force-removes the kid's docker container so
// the next session recreates it from the current image. Useful when a
// botched Claude self-update leaves the binary missing in /home/coder/.npm-global.
function ResetContainerCard({ userId, name }) {
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  const handleReset = async () => {
    setResetting(true);
    setErr('');
    try {
      await claudeApi.resetContainer(userId);
      setDone(true);
      setConfirming(false);
      setTimeout(() => setDone(false), 4000);
    } catch (e) {
      setErr(e?.response?.data?.error || 'Reset failed.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 dark:text-gray-100">Reset Claude Container</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Wipes {name}&apos;s container and rebuilds it from the image on the next session. Use this if the <code className="font-mono text-xs">claude</code> binary is missing or broken. Workspace files and Claude login are preserved.
          </p>
          {done && (
            <p className="text-xs font-medium text-green-600 dark:text-green-400 mt-2">
              ✓ Container removed. Next terminal open will rebuild it.
            </p>
          )}
          {err && (
            <p className="text-xs font-medium text-red-600 dark:text-red-400 mt-2">{err}</p>
          )}
        </div>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="shrink-0 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Reset…
          </button>
        ) : (
          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={resetting}
              className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={resetting}
              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white transition-colors"
            >
              {resetting ? 'Resetting…' : 'Confirm reset'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsUserDetailPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user: authUser, patchUser } = useAuth();
  const { useBanking, useTickets, useBadges, choresLabel, choreLabel, choresLabelLower, choreLabelLower } = useFamilySettings();

  const [member,          setMember]          = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState('');
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [editingName,     setEditingName]     = useState(false);
  const [nameInput,       setNameInput]       = useState('');
  const [nameSaving,      setNameSaving]      = useState(false);
  const [deleteModal,     setDeleteModal]     = useState(false);
  useScrollLock(deleteModal);
  const [deleteConfirm,   setDeleteConfirm]   = useState('');
  const [deleting,        setDeleting]        = useState(false);
  const [credOpen,        setCredOpen]        = useState(false);
  const [credLogin,       setCredLogin]       = useState(false);
  const [credUsername,    setCredUsername]     = useState('');
  const [credPin,         setCredPin]         = useState('');
  const [credSaving,      setCredSaving]      = useState(false);
  const [credError,       setCredError]       = useState('');
  const nameInputRef = useRef(null);

  const [claudeAccess, setClaudeAccess] = useState(false);

  useEffect(() => {
    familyApi.getFamily()
      .then(({ family, members }) => {
        if (family?.claude_access) setClaudeAccess(true);
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
    const isNumber = typeof value === 'number';
    const isString = typeof value === 'string';
    const optimistic = isNumber ? value : isString ? value : (value ? 1 : 0);
    const rollback   = member[field] ?? (isNumber ? 0 : isString ? '' : 0);
    setMember((prev) => ({ ...prev, [field]: optimistic }));
    try {
      await familyApi.updateUser(Number(userId), { [field]: value });
    } catch {
      setError('Failed to save setting.');
      setMember((prev) => ({ ...prev, [field]: rollback }));
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

  const openCredentials = (prefillLogin = false) => {
    setCredLogin(prefillLogin || !!member.allow_login);
    setCredUsername(member.username || '');
    setCredPin('');
    setCredError('');
    setCredOpen(true);
  };

  const saveCredentials = async () => {
    setCredError('');
    const payload = { allow_login: credLogin };
    if (credLogin) {
      if (!credUsername.trim()) { setCredError('Username is required.'); return; }
      payload.username = credUsername.trim();
      if (credPin) {
        if (!/^\d{4}$/.test(credPin)) { setCredError('PIN must be 4 digits.'); return; }
        payload.pin = credPin;
      }
    }
    setCredSaving(true);
    try {
      await familyApi.updateUser(Number(userId), payload);
      setMember((prev) => ({
        ...prev,
        allow_login: credLogin ? 1 : 0,
        username: credLogin ? credUsername.trim() : prev.username,
      }));
      setCredOpen(false);
    } catch (err) {
      setCredError(err.response?.data?.error || 'Failed to save credentials.');
    } finally {
      setCredSaving(false);
    }
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

  const hasLogin = !!member.allow_login;

  const toggles = [
    isKid && {
      field:       'show_on_dashboard',
      label:       'Show on Dashboard',
      description: `Show ${member.name} on the family dashboard.`,
    },
    isKid && useBanking && {
      field:       'show_balance_on_dashboard',
      label:       'Show Balance on Dashboard',
      description: `Display ${member.name}'s bank balance on the family dashboard.`,
    },
    !isKid && {
      field:       'chores_enabled',
      label:       `Enable ${choresLabel}`,
      description: `Allow this parent to have their own ${choreLabelLower} list and appear on the dashboard.`,
    },
  ].filter(Boolean);

  const SET_APPROVAL_OPTIONS = [
    { value: 'none', label: 'Auto-accepted' },
    { value: 'step', label: 'Approve each step' },
    { value: 'set',  label: 'Approve Set completion' },
  ];

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

      {/* ── Chores & Tickets ── */}
      {(isKid || !!member.chores_enabled) && (
        <div className="mb-6 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1">{choresLabel} {isKid ? '& Tickets' : ''}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            <button
              onClick={() => navigate(`/settings/chores/${userId}`)}
              className="text-left p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-brand-300 dark:hover:border-brand-500/50 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-500/20 flex items-center justify-center text-brand-600 dark:text-brand-400">
                  <FontAwesomeIcon icon={faListCheck} />
                </span>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{choresLabel}</h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Manage {member.name}'s {choreLabelLower} list and schedule.</p>
            </button>

            {isKid && useTickets && (
              <div className="p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 text-base leading-none">
                    🎟
                  </span>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Tickets / Day</h3>
                </div>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{member.daily_ticket_potential ?? 0}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Maximum tickets earnable per day from {choresLabelLower}.</p>
              </div>
            )}

          </div>
        </div>
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

      {/* ── Login Credentials (kids only) ── */}
      {isKid && (
        <div className="mb-6 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1">Login Credentials</h2>
          <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {member.allow_login ? 'Login enabled' : 'Login disabled'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {member.allow_login ? `Username: ${member.username || '—'}` : `${member.name} cannot log in to the app.`}
              </p>
            </div>
            <button
              onClick={() => openCredentials()}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-sm font-medium hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
            >
              <FontAwesomeIcon icon={faKey} className="mr-1.5 text-xs" />
              Edit
            </button>
          </div>
        </div>
      )}

      {/* ── What login unlocks (kids only, shown while login is disabled) ── */}
      {isKid && !hasLogin && (
        <div className="mb-6 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1">Enable login to unlock</h2>
          <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl space-y-4">
            <button
              type="button"
              onClick={() => openCredentials(true)}
              className="w-full flex items-start gap-3 text-left rounded-lg -m-1 p-1 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <FontAwesomeIcon icon={faCircleCheck} className="text-brand-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-gray-100">{choreLabel} approval controls</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Require {member.name}'s {choresLabelLower} and task sets to land in your inbox for approval first, so they can't just check everything off themselves.
                </p>
              </div>
            </button>
            {useBanking && (
              <button
                type="button"
                onClick={() => openCredentials(true)}
                className="w-full flex items-start gap-3 text-left rounded-lg -m-1 p-1 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <FontAwesomeIcon icon={faCoins} className="text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-gray-100">Hands-on banking</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    Turn on "Require Working with Currency" so {member.name} drags real bills and coins around to receive, spend, and transfer — learning how money works instead of watching a number change.
                  </p>
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Approvals (kids only, when login is enabled) ── */}
      {isKid && hasLogin && (
        <div className="mb-6 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1">Approvals</h2>
          {/* Require Chore Approval toggle */}
          <div className="flex items-start justify-between gap-6 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 dark:text-gray-100">Require {choreLabel} Approval</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Kids can check off {choresLabelLower} but they'll show up under the parent's inbox before tickets are awarded.</p>
            </div>
            <Toggle checked={!!member.require_task_approval} onChange={(v) => handleToggle('require_task_approval', v)} />
          </div>
          {/* Set approval level dropdown */}
          <div className="flex items-start justify-between gap-6 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 dark:text-gray-100">Set & Step approval level</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Controls whether task set progress needs parent approval.</p>
            </div>
            <select
              value={member.require_set_approval || 'none'}
              onChange={(e) => handleToggle('require_set_approval', e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400 shrink-0"
            >
              {SET_APPROVAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* ── Banking toggles (kids only, when banking is enabled and login is enabled) ── */}
      {isKid && useBanking && hasLogin && (() => {
        const bankingToggles = [
          {
            field:       'require_currency_work',
            label:       'Require Working with Currency',
            description: 'The only way to receive, transfer, or withdraw is by using the money visualizer.',
          },
          {
            field:       'allow_withdraws',
            label:       'Allow Withdraws',
            description: `Let ${member.name} withdraw money from their accounts.`,
          },
          {
            field:       'allow_transfers',
            label:       'Allow Transfers',
            description: `Let ${member.name} transfer money between accounts.`,
          },
        ];
        return (
          <div className="mb-6 space-y-3">
            <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1">Banking</h2>
            {bankingToggles.map(({ field, label, description }) => (
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
        );
      })()}

      {/* ── Claude Code (only shown if family has access) ── */}
      {claudeAccess && <div className="mb-6 space-y-3">
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1">Claude Code</h2>
        <div className="flex items-start justify-between gap-6 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 dark:text-gray-100">Enable Claude Code</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {isKid
                ? `Give ${member.name} access to an AI coding assistant. Runs in a sandboxed container. First time requires a parent to open the terminal and run login.`
                : `Enable a sandboxed Claude Code terminal for ${member.name}.`}
            </p>
          </div>
          <Toggle checked={!!member.claude_enabled} onChange={(v) => handleToggle('claude_enabled', v)} />
        </div>
        {!!member.claude_enabled && (
          <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-gray-100">Model</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Haiku is fastest and cheapest. Sonnet is balanced. Opus is most capable for complex projects.
                </p>
              </div>
              <select
                value={member.claude_model || 'sonnet'}
                onChange={(e) => handleToggle('claude_model', e.target.value)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              >
                <option value="haiku">Haiku (fastest)</option>
                <option value="sonnet">Sonnet (balanced)</option>
                <option value="opus">Opus (powerful)</option>
              </select>
            </div>
          </div>
        )}
        {!!member.claude_enabled && isKid && (
          <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-gray-100">Daily Time Limit</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  How long {member.name} can use Claude Code per day before being cut off.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  min={5}
                  max={480}
                  step={5}
                  value={member.claude_time_limit ?? 60}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v)) setMember((prev) => ({ ...prev, claude_time_limit: v }));
                  }}
                  onBlur={(e) => {
                    const v = Math.max(5, Math.min(480, parseInt(e.target.value, 10) || 60));
                    handleToggle('claude_time_limit', v);
                  }}
                  className="w-20 px-2 py-1.5 text-sm text-center rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
                <span className="text-sm text-gray-500 dark:text-gray-400">min</span>
              </div>
            </div>
          </div>
          )}
        {!!member.claude_enabled && isKid && (
          <ResetContainerCard
            userId={member.id}
            name={member.name}
          />
        )}
      </div>}

      {/* ── Badges ── */}
      {useBadges && (
      <div className="mb-6 space-y-3">
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1">Badges</h2>

        {/* Badge Level */}
        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 dark:text-gray-100">Badge Level</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Sets which level requirements {member.name} sees when picking a badge.
              </p>
            </div>
            <select
              value={member.badge_level ?? ''}
              onChange={(e) => handleToggle('badge_level', e.target.value || null)}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            >
              <option value="">Not set</option>
              {Object.entries(BADGE_LEVELS).map(([key, lvl]) => (
                <option key={key} value={key}>{lvl.label} · {lvl.ageRange}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Max Active Badges */}
        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 dark:text-gray-100">Max Active Badges</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                How many badges {member.name} can be working on at once.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="number"
                min={1}
                max={50}
                value={member.max_active_badges ?? 3}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v)) setMember((prev) => ({ ...prev, max_active_badges: v }));
                }}
                onBlur={(e) => {
                  const v = Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 3));
                  handleToggle('max_active_badges', v);
                }}
                className="w-16 px-2 py-1.5 text-sm text-center rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Badge & Award Notifications — per-kid parent-notification mode for
            every Curiosity badge/award this kid works on. */}
        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 dark:text-gray-100">Badge &amp; Award Notifications</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                When to send parents an inbox notification as {member.name} works on badges and awards.
              </p>
            </div>
            {hasLogin ? (
              <select
                value={member.badge_notify_mode ?? 'off'}
                onChange={(e) => handleToggle('badge_notify_mode', e.target.value)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none shrink-0"
              >
                <option value="off">Off</option>
                <option value="each_step">On each step completion</option>
                <option value="on_completion">On set (final step) completion</option>
              </select>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic shrink-0 max-w-[9rem] text-right">
                Enable login to set this.
              </p>
            )}
          </div>
        </div>
      </div>
      )}

      {/* ── Deactivate / Reactivate ── */}
      <div className="mt-10 pt-6 border-t border-gray-200 dark:border-gray-700 mb-6">
        <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
          {member.is_active ? (
            <>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">Deactivate {member.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Hide this user from login and the dashboard. Their data is preserved.</p>
              </div>
              <button
                onClick={async () => {
                  if (!confirm(`Deactivate ${member.name}?`)) return;
                  try {
                    await familyApi.deactivateUser(Number(userId));
                    navigate('/settings/users');
                  } catch {
                    setError('Failed to deactivate user.');
                  }
                }}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Deactivate
              </button>
            </>
          ) : (
            <>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">Reactivate {member.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Restore this user so they can log in and appear on the dashboard.</p>
              </div>
              <button
                onClick={async () => {
                  try {
                    await familyApi.updateUser(Number(userId), { is_active: true });
                    setMember((prev) => ({ ...prev, is_active: 1 }));
                  } catch {
                    setError('Failed to reactivate user.');
                  }
                }}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg border border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 text-sm font-medium hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
              >
                Reactivate
              </button>
            </>
          )}
        </div>
      </div>

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
              <p>· {choresLabel} and {choreLabelLower} history</p>
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

      {/* ── Credentials modal ── */}
      <Modal open={credOpen} onClose={() => !credSaving && setCredOpen(false)} title="Login Credentials">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Allow login for child</label>
            <Toggle checked={credLogin} onChange={setCredLogin} />
          </div>
          {credLogin && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
                <input
                  type="text"
                  value={credUsername}
                  onChange={(e) => setCredUsername(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  PIN (4 digits) <span className="text-gray-400 dark:text-gray-500 font-normal">{member.username ? '— leave blank to keep current' : ''}</span>
                </label>
                <input
                  type="password"
                  value={credPin}
                  onChange={(e) => setCredPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  maxLength={4}
                  placeholder="••••"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-200"
                />
              </div>
            </>
          )}
          {credError && <p className="text-sm text-red-500">{credError}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={saveCredentials}
              disabled={credSaving}
              className="flex-1 bg-brand-500 hover:bg-brand-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {credSaving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setCredOpen(false)}
              disabled={credSaving}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

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
