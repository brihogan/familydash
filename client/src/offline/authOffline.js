import db from './db.js';

/** Cache user identity for offline fallback. */
export async function cacheSession(user) {
  if (!user?.id) return;
  await db.cachedSession.put({
    userId: user.id,
    familyId: user.familyId,
    role: user.role,
    name: user.name,
    avatarColor: user.avatarColor,
    avatarEmoji: user.avatarEmoji,
    cachedAt: Date.now(),
  });
}

/** Read cached session (offline fallback). Returns user-like object or null. */
export async function getCachedSession() {
  const all = await db.cachedSession.toArray();
  if (all.length === 0) return null;
  // Return the most recently cached session
  return all.sort((a, b) => b.cachedAt - a.cachedAt)[0];
}

/** Clear cached session on logout. */
export async function clearSession() {
  await db.cachedSession.clear();
}

/** Clear all Dexie data except the mutation queue (which may have unsynced changes). */
export async function clearDataOnLogout() {
  await Promise.all([
    db.dashboardMembers.clear(),
    db.choreTemplates.clear(),
    db.choreLogs.clear(),
    db.familyMembers.clear(),
    db.familySettings.clear(),
    db.cachedSession.clear(),
    db.syncMeta.clear(),
    db.ticketLedger.clear(),
    db.rewards.clear(),
    db.rewardRedemptions.clear(),
    db.bankAccounts.clear(),
    db.bankTransactions.clear(),
    db.pendingDeposits.clear(),
  ]);
}
