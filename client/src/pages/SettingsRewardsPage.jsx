import { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear, faPlus } from '@fortawesome/free-solid-svg-icons';
import { rewardsApi } from '../api/rewards.api.js';
import Modal from '../components/shared/Modal.jsx';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import EmptyState from '../components/shared/EmptyState.jsx';

function RewardForm({ initial, onSave, onCancel, loading }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [ticketCost, setTicketCost] = useState(initial?.ticket_cost || 10);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name required.'); return; }
    setError('');
    await onSave({ name, description, ticket_cost: ticketCost });
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
        <input type="number" min={1} value={ticketCost} onChange={(e) => setTicketCost(parseInt(e.target.value, 10) || 1)}
          className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
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

export default function SettingsRewardsPage() {
  const [rewards, setRewards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [editReward, setEditReward] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchRewards = useCallback(async () => {
    try {
      const data = await rewardsApi.getRewards();
      setRewards(data.rewards);
    } catch {
      setError('Failed to load rewards.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRewards(); }, [fetchRewards]);

  const handleAdd = async (data) => {
    setFormLoading(true);
    try {
      await rewardsApi.createReward(data);
      setAddModal(false);
      fetchRewards();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = async (data) => {
    setFormLoading(true);
    try {
      await rewardsApi.updateReward(editReward.id, data);
      setEditReward(null);
      fetchRewards();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this reward?')) return;
    await rewardsApi.deleteReward(id);
    fetchRewards();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          <FontAwesomeIcon icon={faGear} className="mr-2 text-brand-500" />
          Manage Rewards
        </h1>
        <button onClick={() => setAddModal(true)}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm rounded-lg font-medium transition-colors"
          aria-label="Add Reward">
          <FontAwesomeIcon icon={faPlus} />
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}

      {loading ? <LoadingSkeleton rows={3} /> : rewards.length === 0 ? (
        <EmptyState title="No rewards yet" description="Add rewards for kids to redeem with their tickets." />
      ) : (
        <div className="space-y-2">
          {rewards.map((r) => (
            <div key={r.id} className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="flex-1 min-w-0">
                <p className="font-medium">{r.name}</p>
                {r.description && <p className="text-sm text-gray-400">{r.description}</p>}
              </div>
              <span className="text-sm font-medium text-brand-600">🎟 {r.ticket_cost}</span>
              <button onClick={() => setEditReward(r)} className="text-sm text-blue-500 hover:underline">Edit</button>
              <button onClick={() => handleDelete(r.id)} className="text-sm text-red-500 hover:underline">Remove</button>
            </div>
          ))}
        </div>
      )}

      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Reward">
        <RewardForm onSave={handleAdd} onCancel={() => setAddModal(false)} loading={formLoading} />
      </Modal>
      <Modal open={!!editReward} onClose={() => setEditReward(null)} title="Edit Reward">
        <RewardForm initial={editReward} onSave={handleEdit} onCancel={() => setEditReward(null)} loading={formLoading} />
      </Modal>
    </div>
  );
}
