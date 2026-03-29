import db from './db.js';
import { getAllPending, markProcessing, markFailed, markPending, remove } from './mutationQueue.js';
import { getCachedSession } from './authOffline.js';
import { onOnline } from './networkStatus.js';
import { choresApi } from '../api/chores.api.js';
import { dashboardApi } from '../api/dashboard.api.js';
import { familyApi } from '../api/family.api.js';
import { ticketsApi } from '../api/tickets.api.js';
import { rewardsApi } from '../api/rewards.api.js';
import { accountsApi } from '../api/accounts.api.js';
import { overviewApi } from '../api/overview.api.js';
import { activityApi } from '../api/activity.api.js';
import { taskSetsApi } from '../api/taskSets.api.js';
import { inboxApi } from '../api/inbox.api.js';
import { todayISO, yesterdayISO } from '../utils/formatDate.js';

let locked = false;
let intervalId = null;

/** Returns true while the sync engine is actively processing (push + pull). */
export function isSyncInProgress() { return locked; }

// Map mutation types to API calls
const API_HANDLERS = {
  COMPLETE_CHORE: (p) => choresApi.completeChore(p.userId, p.logId, p.date),
  UNCOMPLETE_CHORE: (p) => choresApi.uncompleteChore(p.userId, p.logId, p.date),
  ADJUST_TICKETS: (p) => ticketsApi.adjustTickets(p.userId, { amount: p.amount, description: p.description }),
  REDEEM_REWARD: (p) => rewardsApi.redeemReward(p.userId, p.rewardId),
  BANK_TRANSACTION: (p) => accountsApi.createTransaction(p.userId, p.accountId, p.data),
  CLAIM_PENDING_DEPOSIT: async (p) => {
    let pdId = p.pdId;
    // Temp IDs (negative) don't exist on the server — resolve to real ID
    if (pdId < 0) {
      const { pending_deposits } = await accountsApi.getPendingDeposits(p.userId);
      // Match by amount — best heuristic for finding the right one
      const match = pending_deposits.find((pd) => pd.amount_cents === p.amountCents);
      if (!match) return; // Already claimed or doesn't exist — skip
      pdId = match.id;
    }
    return accountsApi.claimPendingDeposit(p.userId, pdId, p.amountCents, p.allocations);
  },
};

async function processQueue() {
  if (locked || !navigator.onLine) return;
  locked = true;

  try {
    // 1. Drain mutation queue FIFO
    const mutations = await getAllPending();

    for (const mutation of mutations) {
      const handler = API_HANDLERS[mutation.type];
      if (!handler) {
        await remove(mutation.id);
        continue;
      }

      await markProcessing(mutation.id);

      try {
        await handler(mutation.payload);
        await remove(mutation.id);
      } catch (err) {
        if (err.response?.status === 409) {
          // Conflict — accept server state, remove from queue
          await remove(mutation.id);
        } else if (err.response && err.response.status >= 400 && err.response.status < 500) {
          // Client error — mark failed (will retry up to 3x)
          await markFailed(mutation.id, err.response.data?.error || err.message);
        } else {
          // Network error — mark pending again, stop processing
          await markPending(mutation.id);
          break;
        }
      }
    }

    // 2. Pull fresh data if queue is now empty
    const remaining = await getAllPending();
    if (remaining.length === 0) {
      await pullFreshData();
    }
  } finally {
    locked = false;
  }
}

async function pullFreshData() {
  const user = await getCachedSession();
  if (!user) return;

  const today = todayISO();
  const yesterday = yesterdayISO();

  const fetches = [
    refreshDashboard(),
    refreshFamilyMembers(),
    refreshRewards(),
  ];

  if (user.role === 'kid') {
    fetches.push(refreshChores(user.userId, today));
    fetches.push(refreshChores(user.userId, yesterday));
    fetches.push(refreshTickets(user.userId));
    fetches.push(refreshBank(user.userId));
    fetches.push(refreshOverview(user.userId));
    fetches.push(refreshActivity(user.userId));
    fetches.push(refreshTrophies(user.userId));
    fetches.push(refreshRecurringRules(user.userId));
  } else {
    // Parent — refresh inbox + family activity + all data for all kids
    fetches.push(refreshInbox(user.familyId));
    fetches.push(refreshFamilyActivity(user.familyId));

    const kids = await db.familyMembers
      .where('role').equals('kid')
      .toArray();

    for (const kid of kids) {
      fetches.push(refreshChores(kid.id, today));
      fetches.push(refreshChores(kid.id, yesterday));
      fetches.push(refreshTickets(kid.id));
      fetches.push(refreshBank(kid.id));
      fetches.push(refreshOverview(kid.id));
      fetches.push(refreshActivity(kid.id));
      fetches.push(refreshTrophies(kid.id));
      fetches.push(refreshRecurringRules(kid.id));
    }
  }

  await Promise.allSettled(fetches);
}

async function refreshDashboard() {
  try {
    const data = await dashboardApi.getDashboard();
    await db.dashboardMembers.bulkPut(
      data.members.map((m) => ({ ...m, familyId: m.familyId || m.family_id })),
    );
    await db.syncMeta.put({ key: 'dashboard', lastSync: Date.now() });
  } catch { /* network error — skip */ }
}

async function refreshFamilyMembers() {
  try {
    const data = await familyApi.getFamily();
    await db.familyMembers.bulkPut(data.members);
    await db.syncMeta.put({ key: 'family', lastSync: Date.now() });
  } catch { /* network error — skip */ }
}

async function refreshChores(userId, date) {
  try {
    const uid = Number(userId);
    const data = await choresApi.getChores(userId, date);
    const newLogs = data.logs.map((l) => ({ ...l, userId: uid, logDate: date }));

    await db.transaction('rw', db.choreLogs, db.syncMeta, async () => {
      await db.choreLogs.where('[userId+logDate]').equals([uid, date]).delete();
      if (newLogs.length > 0) {
        await db.choreLogs.bulkPut(newLogs);
      }
      await db.syncMeta.put({ key: `chores-${uid}-${date}`, lastSync: Date.now() });
    });
  } catch { /* network error — skip */ }
}

async function refreshBank(userId) {
  try {
    const uid = Number(userId);
    const [accountsData, pdData] = await Promise.all([
      accountsApi.getAccounts(userId),
      accountsApi.getPendingDeposits(userId),
    ]);

    await db.transaction('rw', db.bankAccounts, db.pendingDeposits, db.bankTransactions, db.syncMeta, async () => {
      await db.bankAccounts.where('userId').equals(uid).delete();
      if (accountsData.accounts.length > 0) {
        await db.bankAccounts.bulkPut(
          accountsData.accounts.map((a) => ({ ...a, userId: uid })),
        );
      }

      await db.pendingDeposits.where('userId').equals(uid).delete();
      const pds = pdData.pending_deposits || [];
      if (pds.length > 0) {
        await db.pendingDeposits.bulkPut(pds.map((pd) => ({ ...pd, userId: uid })));
      }

      await db.syncMeta.put({ key: `bank-${uid}`, lastSync: Date.now() });
    });

    // Refresh transactions for each account
    for (const acct of accountsData.accounts) {
      try {
        const txData = await accountsApi.getTransactions(userId, acct.id, { limit: 100 });
        await db.transaction('rw', db.bankTransactions, async () => {
          await db.bankTransactions.where('accountId').equals(acct.id).delete();
          if (txData.transactions.length > 0) {
            await db.bankTransactions.bulkPut(
              txData.transactions.map((t) => ({ ...t, accountId: acct.id })),
            );
          }
        });
      } catch { /* skip */ }
    }
  } catch { /* network error — skip */ }
}

async function refreshRewards() {
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
  } catch { /* network error — skip */ }
}

async function refreshTickets(userId) {
  try {
    const uid = Number(userId);
    const data = await ticketsApi.getTickets(userId, { limit: 100 });

    await db.transaction('rw', db.ticketLedger, db.dashboardMembers, db.syncMeta, async () => {
      await db.ticketLedger.where('userId').equals(uid).delete();
      if (data.ledger.length > 0) {
        await db.ticketLedger.bulkPut(
          data.ledger.map((entry) => ({ ...entry, odxId: entry.id, userId: uid })),
        );
      }
      await db.dashboardMembers.where('id').equals(uid).modify((member) => {
        member.ticketBalance = data.ticketBalance;
      });
      await db.syncMeta.put({ key: `tickets-${uid}`, lastSync: Date.now() });
    });
  } catch { /* network error — skip */ }
}

async function refreshOverview(userId) {
  try {
    const uid = Number(userId);
    const data = await overviewApi.getOverview(userId);
    await db.overviewCache.put({ userId: uid, ...data, _ts: Date.now() });
    await db.syncMeta.put({ key: `overview-${uid}`, lastSync: Date.now() });
  } catch { /* network error — skip */ }
}

async function refreshActivity(userId) {
  try {
    const uid = Number(userId);
    const data = await activityApi.getUserActivity(userId, { limit: 200 });
    await db.activityCache.put({
      userId: uid,
      activity: data.activity ?? [],
      _ts: Date.now(),
    });
    await db.syncMeta.put({ key: `activity-${uid}`, lastSync: Date.now() });
  } catch { /* network error — skip */ }
}

async function refreshFamilyActivity(familyId) {
  try {
    // Cache today's activity (default view) — no filters, first page
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const from = d.toISOString().replace('T', ' ').slice(0, 19);
    const data = await activityApi.getFamilyActivity({ from, limit: 200 });
    await db.familyActivityCache.put({ familyId, activity: data.activity, total: data.total, lastSync: Date.now() });
    await db.syncMeta.put({ key: `familyActivity-${familyId}`, lastSync: Date.now() });
  } catch { /* network error — skip */ }
}

async function refreshInbox(familyId) {
  try {
    const data = await inboxApi.getInbox();
    await db.inboxCache.put({ familyId, kids: data.kids, lastSync: Date.now() });
    await db.syncMeta.put({ key: `inbox-${familyId}`, lastSync: Date.now() });
    window.dispatchEvent(new CustomEvent('inbox-updated'));
  } catch { /* network error — skip */ }
}

async function refreshTrophies(userId) {
  try {
    const uid = Number(userId);
    const data = await taskSetsApi.getUserTaskSets(userId);
    await db.trophyCache.put({ userId: uid, ...data, lastSync: Date.now() });
    await db.syncMeta.put({ key: `trophies-${uid}`, lastSync: Date.now() });
  } catch { /* network error — skip */ }
}

async function refreshRecurringRules(userId) {
  try {
    const uid = Number(userId);
    const data = await accountsApi.getRecurringRules(userId);
    await db.transaction('rw', db.recurringRules, db.syncMeta, async () => {
      await db.recurringRules.where('userId').equals(uid).delete();
      const rules = data.rules || [];
      if (rules.length > 0) {
        await db.recurringRules.bulkPut(rules.map((r) => ({ ...r, userId: uid })));
      }
      await db.syncMeta.put({ key: `recurring-${uid}`, lastSync: Date.now() });
    });
  } catch { /* network error — skip */ }
}

/** Called by mutation hooks to flush queue immediately after an API call. */
export function tryFlush() {
  // Small delay to let the server settle
  setTimeout(processQueue, 500);
}

/**
 * Eagerly prefetch all offline data in priority waves.
 * Call after auth confirms (fire-and-forget).
 *
 * Wave 1 (critical): dashboard + family + today's chores
 * Wave 2 (important): bank + tickets + rewards
 * Wave 3 (deferred): trophies + overview + activity + recurring rules + yesterday's chores
 */
export async function prefetchAllData(user) {
  if (!user || locked || !navigator.onLine) return;
  locked = true;

  try {
    // Check for pending mutations — let the queue drain first
    const pendingCount = await db.mutationQueue
      .where('status').anyOf('pending', 'processing').count();
    if (pendingCount > 0) return;

    const today = todayISO();
    const yesterday = yesterdayISO();

    // Resolve user IDs to prefetch for
    let userIds;
    if (user.role === 'kid') {
      userIds = [user.id];
    } else {
      // Parent — fetch family first to discover kids
      await refreshFamilyMembers();
      const kids = await db.familyMembers
        .where('role').equals('kid')
        .toArray();
      userIds = kids.map((k) => k.id);
    }

    // Wave 1: critical — what the user sees first
    const wave1 = [
      refreshDashboard(),
      ...userIds.map((id) => refreshChores(id, today)),
    ];
    if (user.role === 'kid') wave1.push(refreshFamilyMembers());
    if (user.role === 'parent') wave1.push(refreshInbox(user.familyId));
    await Promise.allSettled(wave1);

    // Wave 2: important — bank and tickets pages
    const wave2 = [
      refreshRewards(),
      ...userIds.map((id) => refreshTickets(id)),
      ...userIds.map((id) => refreshBank(id)),
    ];
    await Promise.allSettled(wave2);

    // Wave 3: deferred — everything else
    const wave3 = [
      ...userIds.map((id) => refreshTrophies(id)),
      ...userIds.map((id) => refreshOverview(id)),
      ...userIds.map((id) => refreshActivity(id)),
      ...userIds.map((id) => refreshRecurringRules(id)),
      ...userIds.map((id) => refreshChores(id, yesterday)),
    ];
    if (user.role === 'parent') wave3.push(refreshFamilyActivity(user.familyId));
    await Promise.allSettled(wave3);
  } finally {
    locked = false;
  }
}

/** Initialize the sync engine. Call once at app startup. */
export function initSyncEngine() {
  // Trigger 1: online event (1s delay)
  onOnline(() => {
    setTimeout(processQueue, 1000);
  });

  // Trigger 2: visibility change (1.5s delay)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      setTimeout(processQueue, 1500);
    }
  });

  // Trigger 3: periodic while visible + online (60s)
  intervalId = setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      processQueue();
    }
  }, 60_000);

  // Initial sync attempt
  setTimeout(processQueue, 2000);
}

export function destroySyncEngine() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
