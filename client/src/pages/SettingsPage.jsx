import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear, faUsers, faClipboardCheck, faTrophy, faArrowsRotate } from '@fortawesome/free-solid-svg-icons';
import { useFamilySettings } from '../context/FamilySettingsContext.jsx';
import { familyApi } from '../api/family.api.js';

function buildSettingsCards(choresLabel) {
  return [
  {
    to:          '/settings/users',
    icon:        faUsers,
    label:       `Family & ${choresLabel}`,
    description: 'Add or manage parents and kids.',
  },
  {
    to:          '/settings/tasks',
    icon:        faClipboardCheck,
    label:       'Set Management',
    description: 'Create and assign task sets and awards.',
  },
  {
    to:          '/rewards',
    icon:        faTrophy,
    label:       'Rewards',
    description: 'Create and edit the rewards catalog.',
  },
  {
    to:          '/settings/turns',
    icon:        faArrowsRotate,
    label:       'Turns',
    description: 'Track whose turn it is for family activities.',
  },
  ];
}

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

export default function SettingsPage() {
  const navigate = useNavigate();
  const {
    useBanking, updateUseBanking,
    useSets, updateUseSets,
    useTickets, updateUseTickets,
    choresLabel, updateChoresLabel,
  } = useFamilySettings();
  const [trmnlUrl, setTrmnlUrl] = useState('');
  const [trmnlSaved, setTrmnlSaved] = useState(false);
  const [labelDraft, setLabelDraft] = useState(choresLabel);
  const [labelSaved, setLabelSaved] = useState(false);
  useEffect(() => { setLabelDraft(choresLabel); }, [choresLabel]);
  const saveChoresLabel = async () => {
    await updateChoresLabel(labelDraft);
    setLabelSaved(true);
    setTimeout(() => setLabelSaved(false), 2000);
  };
  const SETTINGS_CARDS = buildSettingsCards(choresLabel);

  useEffect(() => {
    familyApi.getSettings().then((data) => {
      if (data.trmnlWebhookUrl !== undefined) setTrmnlUrl(data.trmnlWebhookUrl);
    }).catch(() => {});
  }, []);

  const saveTrmnlUrl = async () => {
    try {
      await familyApi.updateSettings({ trmnl_webhook_url: trmnlUrl });
      setTrmnlSaved(true);
      setTimeout(() => setTrmnlSaved(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          <FontAwesomeIcon icon={faGear} className="mr-2 text-brand-500" />
          Settings
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Manage your family dashboard configuration.
        </p>
      </div>

      {/* ── Feature toggles ── */}
      <div className="mb-6 space-y-3">
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1">Features</h2>
        <div className="flex items-start justify-between gap-6 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 dark:text-gray-100">Use Tickets &amp; Rewards</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {choresLabel} and/or Sets can earn tickets that can be redeemed for rewards that the family creates.
              This gives motivation to complete tasks.
            </p>
          </div>
          <Toggle checked={useTickets} onChange={updateUseTickets} />
        </div>
        <div className="flex items-start justify-between gap-6 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 dark:text-gray-100">Use Banking</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Allows kids to have a virtual checking, savings, and charity accounts.
              They can transfer money between themselves, spend money, receive allowance, etc.
            </p>
          </div>
          <Toggle checked={useBanking} onChange={updateUseBanking} />
        </div>
        <div className="flex items-start justify-between gap-6 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 dark:text-gray-100">Use Sets</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Sets allow for projects and awards. These are sets of tasks that can be repeated or earned once.
              They allow for advanced multi-step task sets.
            </p>
          </div>
          <Toggle checked={useSets} onChange={updateUseSets} />
        </div>
      </div>

      {/* ── Labels ── */}
      <div className="mb-6 space-y-3">
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1">Labels</h2>
        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
          <p className="font-medium text-gray-900 dark:text-gray-100 mb-1">"{choresLabel}" label</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            What do you call this in your family? Use a plural word like "Chores", "Habits", or "Tasks" — it'll show up everywhere in the UI.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              placeholder="Chores"
              maxLength={40}
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <button
              onClick={saveChoresLabel}
              disabled={!labelDraft.trim() || labelDraft.trim() === choresLabel}
              className="px-4 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded-lg font-medium transition-colors shrink-0"
            >
              {labelSaved ? 'Saved!' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Integrations ── */}
      <div className="mb-6 space-y-3">
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1">Integrations</h2>
        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
          <p className="font-medium text-gray-900 dark:text-gray-100 mb-1">TRMNL Display</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Paste your TRMNL webhook URL to push dashboard data to your e-ink display.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={trmnlUrl}
              onChange={(e) => setTrmnlUrl(e.target.value)}
              placeholder="https://trmnl.com/api/custom_plugins/..."
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <button
              onClick={saveTrmnlUrl}
              className="px-4 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm rounded-lg font-medium transition-colors shrink-0"
            >
              {trmnlSaved ? 'Saved!' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Section links ── */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1">Sections</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SETTINGS_CARDS.filter(({ to }) => (useTickets || to !== '/rewards') && (useSets || to !== '/settings/tasks')).map(({ to, icon, label, description }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className="text-left p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-brand-300 dark:hover:border-brand-500/50 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-500/20 flex items-center justify-center text-brand-600 dark:text-brand-400">
                  <FontAwesomeIcon icon={icon} />
                </span>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{label}</h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
