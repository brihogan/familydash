import { useCallback, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db.js';
import { choresApi } from '../../api/chores.api.js';
import { isSyncInProgress } from '../syncEngine.js';
import { showToast } from '../../components/shared/Toast.jsx';
import { enqueue } from '../mutationQueue.js';

// Day-of-week bitmask: [Sun=64, Mon=1, Tue=2, Wed=4, Thu=8, Fri=16, Sat=32]
const DOW_BITS = [64, 1, 2, 4, 8, 16, 32];

export default function useOfflineChores(userId, date) {
  const uid = Number(userId);

  // Reactive read from Dexie — auto re-renders on change
  const logs = useLiveQuery(
    () => db.choreLogs.where('[userId+logDate]').equals([uid, date]).toArray(),
    [uid, date],
  );

  // Check if we have cached data yet
  const loading = logs === undefined;

  // Fetch from API and populate Dexie
  const refresh = useCallback(async () => {
    if (isSyncInProgress()) return;
    const pendingCount = await db.mutationQueue
      .where('status').anyOf('pending', 'processing').count();
    if (pendingCount > 0) return;

    try {
      const data = await choresApi.getChores(userId, date);
      const newLogs = data.logs.map((l) => ({ ...l, userId: uid, logDate: date }));

      // Atomic swap: delete + re-insert in one transaction so useLiveQuery
      // never sees an empty intermediate state
      await db.transaction('rw', db.choreLogs, db.choreTemplates, db.syncMeta, async () => {
        await db.choreLogs.where('[userId+logDate]').equals([uid, date]).delete();
        if (newLogs.length > 0) {
          await db.choreLogs.bulkPut(newLogs);
        }

        // Also cache chore templates for this user (for offline log generation)
        if (data.logs.length > 0) {
          const templates = data.logs.map((l) => ({
            id: l.chore_template_id,
            userId: uid,
            name: l.name,
            icon: l.icon,
            ticketReward: l.ticket_reward,
            daysOfWeek: l.days_of_week,
            requiresApproval: l.requires_approval,
            sortOrder: l.sort_order,
          }));
          await db.choreTemplates.bulkPut(templates);
        }

        await db.syncMeta.put({ key: `chores-${uid}-${date}`, lastSync: Date.now() });
      });
    } catch {
      // Offline — try to generate temp logs from cached templates
      await maybeGenerateTempLogs(uid, date);
    }
  }, [userId, uid, date]);

  // Trigger fetch on mount / dep change
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Complete a chore (optimistic)
  const completeChore = useCallback(async (logId) => {
    const now = new Date().toISOString();

    // Optimistic update
    await db.choreLogs.update(logId, { completed_at: now });

    // Update dashboard member: increment choreDone + ticket balance
    const log = await db.choreLogs.get(logId);
    const reward = log?.ticket_reward_at_time || log?.ticket_reward || 0;
    await db.dashboardMembers.where('id').equals(uid).modify((member) => {
      member.choreDone = (member.choreDone || 0) + 1;
      if (reward > 0) {
        member.ticketBalance = (member.ticketBalance || 0) + reward;
      }
    });

    // Add ticket ledger entry for the chore reward
    if (reward > 0) {
      await db.ticketLedger.add({
        odxId: -Date.now(),
        userId: uid,
        user_id: uid,
        amount: reward,
        type: 'chore_reward',
        description: `Completed: ${log.name}`,
        reference_id: logId,
        reference_type: 'chore_log',
        created_at: now.replace('T', ' ').slice(0, 19),
      });
    }

    if (navigator.onLine) {
      try {
        await choresApi.completeChore(userId, logId, date);
        const { tryFlush } = await import('../syncEngine.js');
        tryFlush();
        return;
      } catch (err) {
        if (err.response?.status === 409) return; // Already completed
        // Network error or server error — fall through to queue
      }
    }

    await enqueue('COMPLETE_CHORE', { userId, logId, date });
    if (!navigator.onLine) showToast('Saved locally — will sync when online');
  }, [userId, uid, date]);

  // Uncomplete a chore (optimistic)
  const uncompleteChore = useCallback(async (logId) => {
    // Reverse dashboard member: decrement choreDone + ticket balance
    const log = await db.choreLogs.get(logId);
    const reward = log?.ticket_reward_at_time || log?.ticket_reward || 0;
    await db.dashboardMembers.where('id').equals(uid).modify((member) => {
      member.choreDone = Math.max(0, (member.choreDone || 0) - 1);
      if (reward > 0) {
        member.ticketBalance = Math.max(0, (member.ticketBalance || 0) - reward);
      }
    });

    // Add reversal ledger entry
    if (reward > 0) {
      const now = new Date().toISOString();
      await db.ticketLedger.add({
        odxId: -Date.now(),
        userId: uid,
        user_id: uid,
        amount: -reward,
        type: 'chore_reward',
        description: `Undone: ${log.name}`,
        reference_id: logId,
        reference_type: 'chore_log',
        created_at: now.replace('T', ' ').slice(0, 19),
      });
    }

    // Optimistic update
    await db.choreLogs.update(logId, { completed_at: null });

    if (navigator.onLine) {
      try {
        await choresApi.uncompleteChore(userId, logId, date);
        const { tryFlush } = await import('../syncEngine.js');
        tryFlush();
        return;
      } catch (err) {
        if (err.response?.status === 409) return;
      }
    }

    await enqueue('UNCOMPLETE_CHORE', { userId, logId, date });
    if (!navigator.onLine) showToast('Saved locally — will sync when online');
  }, [userId, uid, date]);

  return {
    logs: logs || [],
    loading,
    completeChore,
    uncompleteChore,
    refresh,
  };
}

/**
 * If we're offline and have no logs for today, generate temp logs
 * from cached chore templates.
 */
async function maybeGenerateTempLogs(uid, date) {
  const existing = await db.choreLogs.where('[userId+logDate]').equals([uid, date]).count();
  if (existing > 0) return; // Already have logs (cached from a previous fetch)

  const templates = await db.choreTemplates.where('userId').equals(uid).toArray();
  if (templates.length === 0) return; // No templates cached — nothing we can do

  const dayBit = DOW_BITS[new Date(date + 'T12:00:00').getDay()];
  const tempLogs = [];

  for (const tmpl of templates) {
    if (tmpl.daysOfWeek != null && !(tmpl.daysOfWeek & dayBit)) continue;
    tempLogs.push({
      id: -Date.now() - Math.random() * 1000, // Negative temp ID
      chore_template_id: tmpl.id,
      userId: uid,
      logDate: date,
      name: tmpl.name,
      icon: tmpl.icon,
      ticket_reward: tmpl.ticketReward,
      requires_approval: tmpl.requiresApproval,
      sort_order: tmpl.sortOrder,
      completed_at: null,
      approval_status: null,
      days_of_week: tmpl.daysOfWeek,
    });
  }

  if (tempLogs.length > 0) {
    await db.choreLogs.bulkPut(tempLogs);
  }
}
