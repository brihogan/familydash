// The one floating element in the whole feature — a bookmark, not a chat
// surface. Shows the most recent conversation on this badge so a kid who backed
// out of a step can find their way back to what they were digging into.
//
// Phase 1 sends you to the Wonders page (step focus mode is per-row state, so
// reopening the exact step lands in Phase 3 with the real threads). Placement
// and wording are what's up for review here.

import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRotateLeft } from '@fortawesome/free-solid-svg-icons';
import { aiTutorEnabledFor } from '../../constants/aiFlags.js';

export default function ResumePill({ taskSetId, userId, threads = [] }) {
  const navigate = useNavigate();
  if (!aiTutorEnabledFor(userId)) return null;

  // `threads` arrives newest-first from the API.
  const thread = threads.find((t) => String(t.taskSetId) === String(taskSetId));
  if (!thread) return null;

  const topic = thread.trail?.[thread.trail.length - 1] || 'your question';

  return (
    <div className="fixed bottom-4 inset-x-0 z-30 flex justify-center px-4 pointer-events-none">
      <button
        onClick={() => navigate(`/wonders/${userId}`)}
        className="pointer-events-auto max-w-full inline-flex items-center gap-2 pl-3 pr-4 py-2 rounded-full shadow-lg bg-white dark:bg-gray-800 border border-brand-200 dark:border-brand-500/40 text-sm text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/20 transition-colors"
      >
        <FontAwesomeIcon icon={faArrowRotateLeft} className="text-xs" />
        <span className="truncate">Back to {topic}</span>
      </button>
    </div>
  );
}
