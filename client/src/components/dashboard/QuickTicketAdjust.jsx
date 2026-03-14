import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlusMinus, faPlus, faMinus } from '@fortawesome/free-solid-svg-icons';
import Modal from '../shared/Modal.jsx';
import { ticketsApi } from '../../api/tickets.api.js';

const STORAGE_KEY = 'ticket_recent_adjustments';
const MAX_RECENT  = 5;

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function saveRecent({ mode, amount, description }) {
  const entry = { mode, amount, description };
  // Deduplicate by all three fields
  const deduped = loadRecent().filter(
    (r) => !(r.mode === entry.mode && r.amount === entry.amount && r.description === entry.description)
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...deduped].slice(0, MAX_RECENT)));
}

/**
 * Ticket adjustment button + modal (parent only).
 * variant='icon'   — small outlined ± button (dashboard inline use)
 * variant='button' — labeled green/red button (tickets page)
 * initialMode      — open the dialog pre-set to 'add' or 'remove' (default: 'add')
 */
export default function QuickTicketAdjust({ userId, ticketBalance = 0, onDone, initialMode = 'add', variant = 'icon', large = false }) {
  const [open,          setOpen]          = useState(false);
  const [mode,          setMode]          = useState(initialMode);
  const [amount,        setAmount]        = useState(1);
  const [description,   setDescription]   = useState('');
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');
  const [recent,        setRecent]        = useState([]);

  const handleOpen = (e) => {
    e.stopPropagation();
    setMode(initialMode);
    setAmount(1);
    setDescription('');
    setError('');
    setRecent(loadRecent());
    setOpen(true);
  };

  const handleClose = () => { if (!loading) setOpen(false); };

  const applyRecent = (r) => {
    setMode(r.mode);
    setAmount(r.amount);
    setDescription(r.description);
  };

  const isActiveRecent = (r) =>
    r.mode === mode && r.amount === amount && r.description === description;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) { setError('Please enter a reason.'); return; }
    setLoading(true);
    setError('');
    try {
      await ticketsApi.adjustTickets(userId, {
        amount: mode === 'add' ? amount : -amount,
        description: description.trim(),
      });
      saveRecent({ mode, amount, description: description.trim() });
      setOpen(false);
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to adjust tickets.');
    } finally {
      setLoading(false);
    }
  };

  const ticketWord    = amount !== 1 ? 'tickets' : 'ticket';
  const wouldGoNegative = mode === 'remove' && amount > ticketBalance;

  return (
    <>
      {variant === 'button' ? (
        <button
          type="button"
          onClick={handleOpen}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-medium transition-colors ${
            initialMode === 'add'
              ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:border-green-700/50 dark:text-green-300 dark:hover:bg-green-900/50'
              : 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:border-red-700/50 dark:text-red-300 dark:hover:bg-red-900/50'
          }`}
        >
          <FontAwesomeIcon icon={initialMode === 'add' ? faPlus : faMinus} className="text-xs" />
          {initialMode === 'add' ? 'Add' : 'Remove'}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          className={`inline-flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors ${
            large ? 'rounded-full w-9 h-9' : 'rounded-full w-7 h-7'
          }`}
          title="Adjust tickets"
        >
          <FontAwesomeIcon icon={faPlusMinus} className={large ? 'text-base' : 'text-xs block'} />
        </button>
      )}

      <Modal open={open} onClose={handleClose} title="Adjust Tickets">
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Recent adjustments — above the toggle */}
          {recent.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Recent</p>
              <div className="flex flex-wrap gap-1.5">
                {recent.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => applyRecent(r)}
                    className={`px-2.5 py-1 rounded-full text-xs border font-medium transition-colors ${
                      isActiveRecent(r)
                        ? r.mode === 'add'
                          ? 'bg-green-100 border-green-400 text-green-700'
                          : 'bg-red-100 border-red-400 text-red-700'
                        : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                    }`}
                  >
                    {r.mode === 'add' ? '+' : '−'}{r.amount} {r.description}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Add / Remove toggle */}
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">New Adjustment</p>
          <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
            <button
              type="button"
              onClick={() => setMode('add')}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                mode === 'add'
                  ? 'bg-green-500 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              + Add
            </button>
            <button
              type="button"
              onClick={() => setMode('remove')}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                mode === 'remove'
                  ? 'bg-red-500 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              − Remove
            </button>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Number of tickets</label>
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => { const v = e.target.value; setAmount(v === '' ? '' : Math.max(0, parseInt(v, 10) || 0)); }}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>

          {/* Clamp warning */}
          {wouldGoNegative && (
            <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              This kid only has {ticketBalance} ticket{ticketBalance !== 1 ? 's' : ''}. Their balance will be set to 0.
            </p>
          )}

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason</label>
            <input
              type="text"
              placeholder="e.g. Extra chores, bonus, penalty…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={loading || !amount}
              className={`flex-1 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 ${
                mode === 'add' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
              }`}
            >
              {loading
                ? 'Saving…'
                : mode === 'add'
                  ? `+ Add ${amount} ${ticketWord}`
                  : `− Remove ${amount} ${ticketWord}`}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
