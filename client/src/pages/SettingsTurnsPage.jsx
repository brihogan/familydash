import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faPlus, faChevronRight, faCheck, faTrash } from '@fortawesome/free-solid-svg-icons';
import { turnsApi } from '../api/turns.api.js';
import Avatar from '../components/shared/Avatar.jsx';
import Modal from '../components/shared/Modal.jsx';

export default function SettingsTurnsPage() {
  const navigate = useNavigate();
  const [turns, setTurns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    turnsApi.getTurns()
      .then((data) => setTurns(data.turns))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await turnsApi.createTurn({ name: newName.trim() });
      setNewName('');
      setShowAdd(false);
      load();
    } catch { /* ignore */ }
    setSaving(false);
  };

  const currentMember = (turn) => turn.members?.find((m) => m.is_current);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/settings')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Turns</h1>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="w-9 h-9 rounded-full bg-brand-500 hover:bg-brand-600 text-white flex items-center justify-center transition-colors"
        >
          <FontAwesomeIcon icon={faPlus} className="text-sm" />
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : turns.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <p className="text-lg font-medium mb-1">No turns yet</p>
          <p className="text-sm">Tap + to create one and track whose turn it is.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {turns.map((turn) => {
            const current = currentMember(turn);
            return (
              <button
                key={turn.id}
                onClick={() => navigate(`/settings/turns/${turn.id}`)}
                className="w-full text-left flex items-center gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-brand-300 dark:hover:border-brand-500/50 transition-all"
              >
                {current && (
                  <Avatar
                    name={current.name}
                    color={current.avatar_color}
                    emoji={current.avatar_emoji}
                    size="sm"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{turn.name}</p>
                  {current && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {current.name}'s turn
                    </p>
                  )}
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">{turn.filter}</span>
                <FontAwesomeIcon icon={faChevronRight} className="text-gray-300 dark:text-gray-600 text-sm" />
              </button>
            );
          })}
        </div>
      )}

      {/* Add modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Turn">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Pick the movie"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || saving}
              className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-colors"
            >
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
