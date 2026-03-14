import { useCallback } from 'react';
import { enqueue } from '../mutationQueue.js';
import { showToast } from '../../components/shared/Toast.jsx';

/**
 * Generic offline-first mutation hook.
 *
 * @param {object} opts
 * @param {string} opts.type            - Mutation type (e.g. 'COMPLETE_CHORE')
 * @param {function} opts.applyOptimistic - Async fn(payload) that applies optimistic update to Dexie
 * @param {function} opts.apiCall        - Async fn(payload) that makes the real API call
 * @param {function} [opts.applyResponse] - Async fn(response, payload) to apply server response to Dexie
 */
export default function useOfflineMutation({ type, applyOptimistic, apiCall, applyResponse }) {
  const mutate = useCallback(async (payload) => {
    // 1. Optimistic update (immediate, fires celebrations)
    await applyOptimistic(payload);

    // 2. If online, try the API call
    if (navigator.onLine) {
      try {
        const response = await apiCall(payload);
        if (applyResponse) await applyResponse(response, payload);
        // Trigger sync engine to pull fresh data
        const { tryFlush } = await import('../syncEngine.js');
        tryFlush();
        return response;
      } catch (err) {
        if (err.response) {
          // Server responded — 409 conflict or other 4xx, accept it
          if (err.response.status === 409) {
            // Conflict — server state wins, sync will reconcile
            return;
          }
          // Other server error — queue for retry
        }
        // Network error or server error — queue it
        await enqueue(type, payload);
        showToast('Saved locally — will sync when online');
        return;
      }
    }

    // 3. Offline — queue the mutation
    await enqueue(type, payload);
    showToast('Saved locally — will sync when online');
  }, [type, applyOptimistic, apiCall, applyResponse]);

  return mutate;
}
