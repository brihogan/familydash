import { useState, useCallback, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db.js';
import { ticketsApi } from '../../api/tickets.api.js';
import { enqueue } from '../mutationQueue.js';
import { isSyncInProgress } from '../syncEngine.js';
import { showToast } from '../../components/shared/Toast.jsx';

export default function useOfflineTickets(userId) {
  const uid = Number(userId);
  const [loading, setLoading] = useState(true);

  // Reactive ticket balance from dashboard member cache
  const dashboardMember = useLiveQuery(
    () => db.dashboardMembers.get(uid),
    [uid],
  );
  const ticketBalance = dashboardMember?.ticketBalance ?? 0;

  // Reactive ledger from Dexie
  const ledger = useLiveQuery(
    () => db.ticketLedger.where('userId').equals(uid).reverse().sortBy('created_at'),
    [uid],
  );

  // Fetch from API and populate Dexie
  const refresh = useCallback(async () => {
    if (isSyncInProgress()) return;
    const pendingCount = await db.mutationQueue
      .where('status').anyOf('pending', 'processing').count();
    if (pendingCount > 0) { setLoading(false); return; }

    try {
      // Fetch all ledger entries (no date filter) for caching
      const data = await ticketsApi.getTickets(userId, { limit: 100 });

      await db.transaction('rw', db.ticketLedger, db.dashboardMembers, db.syncMeta, async () => {
        // Replace ledger cache for this user
        await db.ticketLedger.where('userId').equals(uid).delete();
        if (data.ledger.length > 0) {
          await db.ticketLedger.bulkPut(
            data.ledger.map((entry) => ({ ...entry, odxId: entry.id, userId: uid })),
          );
        }
        // Update ticket balance on dashboard member
        await db.dashboardMembers.where('id').equals(uid).modify((member) => {
          member.ticketBalance = data.ticketBalance;
        });
        await db.syncMeta.put({ key: `tickets-${uid}`, lastSync: Date.now() });
      });
    } catch {
      // Offline — cached data is fine
    } finally {
      setLoading(false);
    }
  }, [userId, uid]);

  // Trigger fetch on mount / user change
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Adjust tickets (optimistic, works offline)
  const adjustTickets = useCallback(async ({ amount, description }) => {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const actualAmount = amount; // signed: positive for add, negative for remove

    // Optimistic: update balance
    await db.dashboardMembers.where('id').equals(uid).modify((member) => {
      member.ticketBalance = Math.max(0, (member.ticketBalance || 0) + actualAmount);
    });

    // Optimistic: add ledger entry
    await db.ticketLedger.add({
      odxId: -Date.now(), // temp ID
      userId: uid,
      user_id: uid,
      amount: actualAmount,
      type: 'manual',
      description,
      reference_id: null,
      reference_type: null,
      created_at: now,
    });

    if (navigator.onLine) {
      try {
        await ticketsApi.adjustTickets(userId, { amount, description });
        // Sync engine will pull fresh data
        const { tryFlush } = await import('../syncEngine.js');
        tryFlush();
        return;
      } catch (err) {
        if (err.response?.status >= 400 && err.response?.status < 500) {
          // Server rejected — will reconcile on next sync
          return;
        }
      }
    }

    await enqueue('ADJUST_TICKETS', { userId, amount, description });
    if (!navigator.onLine) showToast('Saved locally — will sync when online');
  }, [userId, uid]);

  return {
    ticketBalance,
    ledger: ledger || [],
    loading: loading && ledger === undefined,
    adjustTickets,
    refresh,
  };
}
