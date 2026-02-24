import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrophy } from '@fortawesome/free-solid-svg-icons';
import { rewardsApi } from '../api/rewards.api.js';
import { ticketsApi } from '../api/tickets.api.js';
import { familyApi } from '../api/family.api.js';
import { useAuth } from '../context/AuthContext.jsx';
import RewardCatalog from '../components/rewards/RewardCatalog.jsx';
import RedemptionHistory from '../components/rewards/RedemptionHistory.jsx';
import Modal from '../components/shared/Modal.jsx';
import Confetti from '../components/shared/Confetti.jsx';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import { playCashIn } from '../utils/sounds.js';

// ── Reward form (parent add / edit) ──────────────────────────────────────────

const PRESET_EMOJIS = [
  '🎬', '🎮', '🍕', '🍦', '🍫', '🎯',
  '🎁', '🌟', '🎤', '🎸', '🎨', '🏖️',
  '🛹', '🎢', '🍟', '🏀', '⚽', '🎪',
];

function RewardForm({ initial, onSave, onCancel, loading }) {
  const [name,        setName]        = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [ticketCost,  setTicketCost]  = useState(initial?.ticket_cost || 10);
  const [emoji,       setEmoji]       = useState(initial?.emoji || '');
  const [customEmoji, setCustomEmoji] = useState('');
  const [error,       setError]       = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name required.'); return; }
    setError('');
    await onSave({ name, description, ticket_cost: ticketCost, emoji: emoji || null });
  };

  const handlePreset = (e) => setEmoji((prev) => prev === e ? '' : e);
  const handleCustomChange = (val) => {
    // Take only the first grapheme cluster (one emoji/char)
    const trimmed = [...val].slice(0, 1).join('');
    setCustomEmoji(trimmed);
    if (trimmed) setEmoji(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Reward Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Movie night" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Optional details" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Ticket Cost</label>
        <input type="number" min={1} value={ticketCost}
          onChange={(e) => setTicketCost(parseInt(e.target.value, 10) || 1)}
          className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      </div>

      {/* Emoji picker */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Icon <span className="text-gray-400 font-normal">(optional)</span>
          {emoji && (
            <span className="ml-2 text-base leading-none">{emoji}</span>
          )}
        </label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {PRESET_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => handlePreset(e)}
              className={`w-9 h-9 rounded-lg text-xl flex items-center justify-center transition-colors ${
                emoji === e
                  ? 'bg-brand-100 ring-2 ring-brand-400'
                  : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Custom:</span>
          <input
            type="text"
            value={customEmoji}
            onChange={(e) => handleCustomChange(e.target.value)}
            placeholder="Paste any emoji"
            className="w-28 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          {emoji && (
            <button
              type="button"
              onClick={() => { setEmoji(''); setCustomEmoji(''); }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={loading}
          className="flex-1 bg-brand-500 hover:bg-brand-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {loading ? 'Saving…' : initial ? 'Save' : 'Add Reward'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Earning reference (parent only) ──────────────────────────────────────────

const MILESTONES = [10, 25, 50, 100];

function daysToEarn(cost, dailyPotential) {
  return Math.max(1, Math.round(cost / dailyPotential));
}

function EarningReference({ kids }) {
  if (!kids.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">
        Time to Earn
        <span className="ml-2 text-xs font-normal text-gray-400">based on each kid's daily chore potential</span>
      </h2>
      <div className="overflow-x-auto">
        <table className="text-sm w-full">
          <thead>
            <tr>
              <th className="text-left text-xs font-medium text-gray-400 pr-6 pb-2 whitespace-nowrap">Tickets</th>
              {kids.map((k) => (
                <th key={k.id} className="text-left pr-6 pb-2">
                  <Link
                    to={`/settings/chores/${k.id}`}
                    className="text-xs font-semibold text-gray-700 hover:text-brand-600 hover:underline"
                  >
                    {k.name}
                  </Link>
                  <div className="text-xs font-normal text-amber-600">🎟 {k.daily_ticket_potential}/day</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MILESTONES.map((m) => (
              <tr key={m} className="border-t border-gray-50">
                <td className="py-1.5 pr-6 font-medium text-gray-700 whitespace-nowrap">🎟 {m}</td>
                {kids.map((k) => {
                  const days = daysToEarn(m, k.daily_ticket_potential);
                  return (
                    <td key={k.id} className="py-1.5 pr-6 text-gray-600 whitespace-nowrap">
                      {days} {days === 1 ? 'day' : 'days'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function RewardsPage() {
  const { user } = useAuth();
  const isParent = user?.role === 'parent';

  const [rewards,         setRewards]         = useState([]);
  const [redemptions,     setRedemptions]     = useState([]);
  const [ticketBalance,   setTicketBalance]   = useState(0);
  const [kidsWithEarning, setKidsWithEarning] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [formLoading,  setFormLoading]  = useState(false);
  const [error,        setError]        = useState('');
  const [success,      setSuccess]      = useState('');

  // Parent: reward management
  const [addModal,   setAddModal]   = useState(false);
  const [editReward, setEditReward] = useState(null);

  // Kid: confirm modal + celebration
  const [pendingRewardId, setPendingRewardId] = useState(null);
  const [showConfetti,    setShowConfetti]    = useState(false);

  const pendingReward = rewards.find((r) => r.id === pendingRewardId);

  const fetchAll = useCallback(async () => {
    try {
      const [rewardsData, redemptionsData, familyData] = await Promise.all([
        rewardsApi.getRewards(),
        rewardsApi.getRedemptions(),
        isParent ? familyApi.getFamily() : Promise.resolve(null),
      ]);
      setRewards(rewardsData.rewards);
      setRedemptions(redemptionsData.redemptions);
      if (isParent && familyData) {
        const earning = familyData.members
          .filter((m) => m.role === 'kid' && m.is_active && (m.daily_ticket_potential ?? 0) > 0)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
        setKidsWithEarning(earning);
      }
      if (!isParent) {
        const ticketsData = await ticketsApi.getTickets(user.id);
        setTicketBalance(ticketsData.ticketBalance);
      }
    } catch {
      setError('Failed to load rewards.');
    } finally {
      setLoading(false);
    }
  }, [user, isParent]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Kid: redemption flow ─────────────────────────────────────────────────

  const handleRedeemRequest = (rewardId) => setPendingRewardId(rewardId);

  const handleRedeemConfirm = async () => {
    if (!pendingRewardId) return;
    const rewardId = pendingRewardId;
    setPendingRewardId(null);
    setRedeemLoading(true);
    setError('');
    setSuccess('');
    try {
      const data = await rewardsApi.redeemReward(user.id, rewardId);
      setTicketBalance(data.ticketBalance);
      playCashIn();
      setShowConfetti(true);
      setSuccess('Reward redeemed! 🎉');
      setTimeout(() => setSuccess(''), 4000);
      fetchAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Redemption failed.');
    } finally {
      setRedeemLoading(false);
    }
  };

  // ── Parent: reward management ────────────────────────────────────────────

  const handleAdd = async (data) => {
    setFormLoading(true);
    try {
      await rewardsApi.createReward(data);
      setAddModal(false);
      fetchAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create reward.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = async (data) => {
    setFormLoading(true);
    try {
      await rewardsApi.updateReward(editReward.id, data);
      setEditReward(null);
      fetchAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update reward.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (rewardId) => {
    if (!confirm('Remove this reward?')) return;
    await rewardsApi.deleteReward(rewardId);
    fetchAll();
  };

  return (
    <div>
      {showConfetti && <Confetti onDone={() => setShowConfetti(false)} />}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          <FontAwesomeIcon icon={faTrophy} className="mr-2 text-brand-500" />
          Rewards
        </h1>
        <div className="flex items-center gap-3">
          {!isParent && (
            <span className="text-sm font-medium text-brand-600">🎟 {ticketBalance} tickets</span>
          )}
          {isParent && (
            <button
              onClick={() => setAddModal(true)}
              className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm rounded-lg font-medium transition-colors"
            >
              + Add Reward
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 mb-4 text-sm">{success}</div>
      )}

      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : (
        <div className="space-y-8">
          {isParent && <EarningReference kids={kidsWithEarning} />}
          <RewardCatalog
            rewards={rewards}
            ticketBalance={ticketBalance}
            onRedeem={handleRedeemRequest}
            onEdit={setEditReward}
            onDelete={handleDelete}
            loading={redeemLoading}
            isParent={isParent}
            kidsWithEarning={kidsWithEarning}
          />

          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">
              {isParent ? 'Redemption History' : 'My Redemptions'}
            </h2>
            <RedemptionHistory redemptions={redemptions} isParent={isParent} />
          </div>
        </div>
      )}

      {/* Parent: add reward */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Reward">
        <RewardForm onSave={handleAdd} onCancel={() => setAddModal(false)} loading={formLoading} />
      </Modal>

      {/* Parent: edit reward */}
      <Modal open={!!editReward} onClose={() => setEditReward(null)} title="Edit Reward">
        <RewardForm initial={editReward} onSave={handleEdit} onCancel={() => setEditReward(null)} loading={formLoading} />
      </Modal>

      {/* Kid: confirm redemption */}
      <Modal open={!!pendingRewardId} onClose={() => setPendingRewardId(null)} title="Redeem Reward">
        <div className="space-y-4">
          {pendingReward?.emoji && (
            <div className="text-4xl text-center">{pendingReward.emoji}</div>
          )}
          <p className="text-sm text-gray-700">
            Are you sure you want to redeem <strong>{pendingReward?.name}</strong> for{' '}
            <strong>🎟 {pendingReward?.ticket_cost} tickets</strong>?
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 flex justify-between">
            <span>Your balance after:</span>
            <span className="font-semibold text-brand-700">
              🎟 {ticketBalance - (pendingReward?.ticket_cost ?? 0)} tickets
            </span>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleRedeemConfirm}
              className="flex-1 bg-brand-500 hover:bg-brand-600 text-white py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Yes, redeem it!
            </button>
            <button
              onClick={() => setPendingRewardId(null)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
