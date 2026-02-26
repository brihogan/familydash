import { useState } from 'react';
import { useFamilySettings } from '../../context/FamilySettingsContext.jsx';

const DAYS = [
  { label: 'Mo', bit: 1  },
  { label: 'Tu', bit: 2  },
  { label: 'We', bit: 4  },
  { label: 'Th', bit: 8  },
  { label: 'Fr', bit: 16 },
  { label: 'Sa', bit: 32 },
  { label: 'Su', bit: 64 },
];
const WEEKDAYS = 31;  // Mo–Fr
const WEEKEND  = 96;  // Sa–Su
const ALL_DAYS = 127;

const LABEL_CLS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';
const INPUT_CLS = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500';

export default function ChoreTemplateForm({ initial, onSave, onCancel, loading, showCopyToggle }) {
  const { useTickets } = useFamilySettings();
  const [name,         setName]         = useState(initial?.name || '');
  const [description,  setDescription]  = useState(initial?.description || '');
  const [ticketReward, setTicketReward] = useState(initial?.ticket_reward ?? 1);
  const [daysOfWeek,   setDaysOfWeek]   = useState(initial?.days_of_week ?? ALL_DAYS);
  const [copyToAll,    setCopyToAll]    = useState(false);
  const [error,        setError]        = useState('');

  const toggleDay = (bit) => setDaysOfWeek((prev) => prev ^ bit);
  const isSet = (bit) => (daysOfWeek & bit) !== 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!daysOfWeek)  { setError('At least one day must be selected.'); return; }
    setError('');
    await onSave({
      name: name.trim(),
      description: description.trim(),
      ticket_reward: ticketReward,
      days_of_week: daysOfWeek,
      copyToAll: showCopyToggle ? copyToAll : false,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className={LABEL_CLS}>Chore Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={INPUT_CLS}
          placeholder="Make bed"
          maxLength={200}
        />
      </div>

      <div>
        <label className={LABEL_CLS}>Description (optional)</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={INPUT_CLS}
          placeholder="Details..."
          maxLength={500}
        />
      </div>

      {useTickets && (
        <div>
          <label className={LABEL_CLS}>Ticket Reward</label>
          <input
            type="number"
            min={0}
            value={ticketReward}
            onChange={(e) => setTicketReward(Math.max(0, parseInt(e.target.value, 10) || 0))}
            className={`w-24 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500`}
          />
        </div>
      )}

      {/* ── Days of week ── */}
      <div>
        <label className={`${LABEL_CLS} mb-1.5`}>Days of Week</label>

        {/* Shortcut toggles */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          <button
            type="button"
            onClick={() => setDaysOfWeek((prev) => (prev & WEEKDAYS) === WEEKDAYS ? prev & ~WEEKDAYS : prev | WEEKDAYS)}
            className={`col-span-5 text-xs py-1 rounded border transition-colors font-medium ${
              (daysOfWeek & WEEKDAYS) === WEEKDAYS
                ? 'bg-brand-500 border-brand-500 text-white'
                : 'bg-brand-50 border-brand-200 text-brand-700 hover:bg-brand-100 dark:bg-gray-700 dark:border-gray-600 dark:text-brand-300 dark:hover:bg-gray-600'
            }`}
          >
            Weekdays
          </button>
          <button
            type="button"
            onClick={() => setDaysOfWeek((prev) => (prev & WEEKEND) === WEEKEND ? prev & ~WEEKEND : prev | WEEKEND)}
            className={`col-span-2 text-xs py-1 rounded border transition-colors font-medium ${
              (daysOfWeek & WEEKEND) === WEEKEND
                ? 'bg-purple-500 border-purple-500 text-white'
                : 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100 dark:bg-gray-700 dark:border-gray-600 dark:text-purple-300 dark:hover:bg-gray-600'
            }`}
          >
            Weekend
          </button>
        </div>

        {/* Individual day toggles */}
        <div className="grid grid-cols-7 gap-1">
          {DAYS.map((d) => (
            <button
              key={d.bit}
              type="button"
              onClick={() => toggleDay(d.bit)}
              className={`py-1.5 text-xs font-medium rounded border transition-colors ${
                isSet(d.bit)
                  ? 'bg-brand-500 border-brand-500 text-white'
                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {showCopyToggle && (
        <div className="flex items-center justify-between py-0.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Copy to all kids</label>
          <button
            type="button"
            role="switch"
            aria-checked={copyToAll}
            onClick={() => setCopyToAll((p) => !p)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${copyToAll ? 'bg-brand-500' : 'bg-gray-200 dark:bg-gray-600'}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${copyToAll ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-brand-500 hover:bg-brand-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {loading ? 'Saving…' : initial ? 'Save Changes' : 'Add Chore'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
