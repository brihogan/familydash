import db from './db.js';

/**
 * Enqueue a mutation for offline processing.
 * @param {string} type - e.g. 'COMPLETE_CHORE', 'UNCOMPLETE_CHORE'
 * @param {object} payload - API call parameters
 * @param {object} [localPatch] - describes the optimistic update (for rollback if needed)
 */
export async function enqueue(type, payload, localPatch = null) {
  return db.mutationQueue.add({
    type,
    payload,
    localPatch,
    status: 'pending',
    retries: 0,
    createdAt: Date.now(),
    error: null,
  });
}

/** Get the oldest pending mutation. */
export async function peek() {
  return db.mutationQueue.where('status').equals('pending').sortBy('id').then((arr) => arr[0] || null);
}

/** Get all pending mutations, oldest first. */
export async function getAllPending() {
  return db.mutationQueue.where('status').equals('pending').sortBy('id');
}

export async function markProcessing(id) {
  return db.mutationQueue.update(id, { status: 'processing' });
}

export async function markFailed(id, error) {
  const record = await db.mutationQueue.get(id);
  if (!record) return;
  const retries = (record.retries || 0) + 1;
  if (retries >= 3) {
    return db.mutationQueue.update(id, { status: 'failed', retries, error: String(error) });
  }
  return db.mutationQueue.update(id, { status: 'pending', retries, error: String(error) });
}

export async function markPending(id) {
  return db.mutationQueue.update(id, { status: 'pending' });
}

export async function remove(id) {
  return db.mutationQueue.delete(id);
}

export async function getPendingCount() {
  return db.mutationQueue.where('status').equals('pending').count();
}
