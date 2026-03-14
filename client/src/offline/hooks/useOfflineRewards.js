import { useState, useCallback, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db.js';
import { rewardsApi } from '../../api/rewards.api.js';
import { enqueue } from '../mutationQueue.js';
import { isSyncInProgress } from '../syncEngine.js';
import { showToast } from '../../components/shared/Toast.jsx';

export default function useOfflineRewards({ isParent, selectedKidId }) {
  const [loading, setLoading] = useState(true);

  // Reactive reads from Dexie
  const rewards = useLiveQuery(
    () => db.rewards.toArray().then((arr) => arr.sort((a, b) => a.ticket_cost - b.ticket_cost)),
    [],
  );
  const allRedemptions = useLiveQuery(() =>
    db.rewardRedemptions.toArray().then((arr) =>
      arr.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
    ), [],
  );

  // Filter redemptions by selected kid (if parent viewing one kid)
  const redemptions = useMemo(() => {
    if (!allRedemptions) return [];
    if (isParent && selectedKidId !== null) {
      return allRedemptions.filter((r) => r.user_id === selectedKidId);
    }
    return allRedemptions;
  }, [allRedemptions, isParent, selectedKidId]);

  // Fetch from API and populate Dexie
  const refresh = useCallback(async () => {
    if (isSyncInProgress()) return;
    const pendingCount = await db.mutationQueue
      .where('status').anyOf('pending', 'processing').count();
    if (pendingCount > 0) { setLoading(false); return; }

    try {
      const [rewardsData, redemptionsData] = await Promise.all([
        rewardsApi.getRewards(),
        rewardsApi.getRedemptions({ limit: 100 }),
      ]);

      await db.transaction('rw', db.rewards, db.rewardRedemptions, db.syncMeta, async () => {
        await db.rewards.clear();
        if (rewardsData.rewards.length > 0) {
          await db.rewards.bulkPut(rewardsData.rewards);
        }
        await db.rewardRedemptions.clear();
        if (redemptionsData.redemptions.length > 0) {
          await db.rewardRedemptions.bulkPut(
            redemptionsData.redemptions.map((r) => ({ ...r, odxId: r.id, userId: r.user_id })),
          );
        }
        await db.syncMeta.put({ key: 'rewards', lastSync: Date.now() });
      });
    } catch {
      // Offline — cached data is fine
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Redeem a reward (optimistic, works offline)
  const redeemReward = useCallback(async (targetUserId, rewardId) => {
    const uid = Number(targetUserId);
    const reward = await db.rewards.get(rewardId);
    if (!reward) throw new Error('Reward not found');

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const cost = reward.ticket_cost;

    // Optimistic: deduct ticket balance
    await db.dashboardMembers.where('id').equals(uid).modify((member) => {
      member.ticketBalance = Math.max(0, (member.ticketBalance || 0) - cost);
    });

    // Optimistic: add redemption record (include user_name/avatar_color for RedemptionHistory)
    const member = await db.dashboardMembers.get(uid) || await db.familyMembers.get(uid);
    await db.rewardRedemptions.add({
      odxId: -Date.now(),
      user_id: uid,
      userId: uid,
      user_name: member?.name || '',
      avatar_color: member?.avatarColor || member?.avatar_color || '#6366f1',
      reward_id: rewardId,
      reward_name_at_time: reward.name,
      ticket_cost_at_time: cost,
      created_at: now,
    });

    // Optimistic: add ticket ledger entry
    await db.ticketLedger.add({
      odxId: -Date.now() - 1,
      userId: uid,
      user_id: uid,
      amount: -cost,
      type: 'redemption',
      description: `Redeemed: ${reward.name}`,
      reference_id: null,
      reference_type: 'reward_redemption',
      created_at: now,
    });

    if (navigator.onLine) {
      try {
        await rewardsApi.redeemReward(targetUserId, rewardId);
        const { tryFlush } = await import('../syncEngine.js');
        tryFlush();
        return;
      } catch (err) {
        if (err.response?.status >= 400 && err.response?.status < 500) {
          return; // Server rejected — sync will reconcile
        }
      }
    }

    await enqueue('REDEEM_REWARD', { userId: targetUserId, rewardId });
    if (!navigator.onLine) showToast('Saved locally — will sync when online');
  }, []);

  return {
    rewards: rewards || [],
    redemptions,
    loading: loading && rewards === undefined,
    redeemReward,
    refresh,
  };
}
