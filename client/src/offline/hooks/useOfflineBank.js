import { useState, useCallback, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db.js';
import { accountsApi } from '../../api/accounts.api.js';
import { enqueue } from '../mutationQueue.js';
import { isSyncInProgress } from '../syncEngine.js';
import { showToast } from '../../components/shared/Toast.jsx';

export default function useOfflineBank(userId) {
  const uid = Number(userId);
  const [loading, setLoading] = useState(true);

  // Reactive reads from Dexie
  const accounts = useLiveQuery(
    () => db.bankAccounts.where('userId').equals(uid).toArray(),
    [uid],
  );

  const allTransactions = useLiveQuery(
    () => db.bankTransactions.toArray().then((arr) =>
      arr.filter((t) => {
        // Filter to accounts owned by this user
        return true; // We'll filter by accountId when rendering
      }).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
    ),
    [uid],
  );

  const pendingDeposits = useLiveQuery(
    () => db.pendingDeposits.where('userId').equals(uid).toArray(),
    [uid],
  );

  // Get transactions for a specific account
  const getTransactionsForAccount = useCallback((accountId) => {
    if (!allTransactions) return [];
    return allTransactions.filter((t) => t.accountId === accountId || t.account_id === accountId);
  }, [allTransactions]);

  // Fetch from API and populate Dexie
  const refresh = useCallback(async () => {
    if (isSyncInProgress()) return;
    const pendingCount = await db.mutationQueue
      .where('status').anyOf('pending', 'processing').count();
    if (pendingCount > 0) { setLoading(false); return; }

    try {
      const [accountsData, pdData] = await Promise.all([
        accountsApi.getAccounts(userId),
        accountsApi.getPendingDeposits(userId),
      ]);

      await db.transaction('rw', db.bankAccounts, db.pendingDeposits, db.syncMeta, async () => {
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

      // Fetch transactions for all accounts
      await refreshTransactions(accountsData.accounts);
    } catch {
      // Offline — cached data is fine
    } finally {
      setLoading(false);
    }
  }, [userId, uid]);

  const refreshTransactions = useCallback(async (accts) => {
    const accountList = accts || (await db.bankAccounts.where('userId').equals(uid).toArray());
    for (const acct of accountList) {
      try {
        const data = await accountsApi.getTransactions(userId, acct.id, { limit: 100 });
        await db.transaction('rw', db.bankTransactions, async () => {
          await db.bankTransactions.where('accountId').equals(acct.id).delete();
          if (data.transactions.length > 0) {
            await db.bankTransactions.bulkPut(
              data.transactions.map((t) => ({ ...t, accountId: acct.id })),
            );
          }
        });
      } catch { /* skip */ }
    }
  }, [userId, uid]);

  useEffect(() => { refresh(); }, [refresh]);

  // Create a transaction (optimistic, works offline)
  const createTransaction = useCallback(async (accountId, data) => {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const amountCents = data.amount_cents;
    const isCredit = ['deposit', 'allowance', 'manual_adjustment'].includes(data.type);
    const signedAmount = isCredit ? amountCents : -amountCents;

    // Optimistic: update account balance
    await db.bankAccounts.where('id').equals(accountId).modify((acct) => {
      acct.balance_cents = (acct.balance_cents || 0) + signedAmount;
    });

    // For transfers, also update destination account
    if (data.type === 'transfer_out' && data.to_account_id) {
      await db.bankAccounts.where('id').equals(data.to_account_id).modify((acct) => {
        acct.balance_cents = (acct.balance_cents || 0) + amountCents;
      });
    }

    // Optimistic: update dashboard member balance (main account only)
    const acct = await db.bankAccounts.get(accountId);
    if (acct && acct.type === 'main') {
      await db.dashboardMembers.where('id').equals(uid).modify((member) => {
        member.mainBalanceCents = (member.mainBalanceCents || 0) + signedAmount;
      });
    }

    // Optimistic: add transaction to Dexie
    await db.bankTransactions.add({
      accountId,
      account_id: accountId,
      amount_cents: signedAmount,
      type: data.type,
      description: data.description || '',
      created_at: now,
      created_by_user_id: null,
      created_by_name: '',
      linked_account_name: null,
      linked_account_owner_name: null,
      linked_account_owner_id: null,
    });

    // For transfers, add the corresponding transfer_in transaction
    if (data.type === 'transfer_out' && data.to_account_id) {
      await db.bankTransactions.add({
        accountId: data.to_account_id,
        account_id: data.to_account_id,
        amount_cents: amountCents,
        type: 'transfer_in',
        description: data.description || '',
        created_at: now,
        created_by_user_id: null,
        created_by_name: '',
        linked_account_name: acct?.name || '',
        linked_account_owner_name: null,
        linked_account_owner_id: null,
      });
    }

    if (navigator.onLine) {
      try {
        await accountsApi.createTransaction(userId, accountId, data);
        const { tryFlush } = await import('../syncEngine.js');
        tryFlush();
        return;
      } catch (err) {
        if (err.response?.status >= 400 && err.response?.status < 500) {
          return; // Server rejected — sync will reconcile
        }
      }
    }

    await enqueue('BANK_TRANSACTION', { userId, accountId, data });
    if (!navigator.onLine) showToast('Saved locally — will sync when online');
  }, [userId, uid]);

  // Claim a pending deposit (optimistic)
  const claimPendingDeposit = useCallback(async (pdId, amountCents, allocations) => {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    // Find the pending deposit
    const pd = await db.pendingDeposits.get(pdId);
    if (!pd) return;

    // Find main account
    const mainAcct = (await db.bankAccounts.where('userId').equals(uid).toArray())
      .find((a) => a.type === 'main');

    if (mainAcct) {
      // Credit main account with full amount
      await db.bankAccounts.where('id').equals(mainAcct.id).modify((acct) => {
        acct.balance_cents = (acct.balance_cents || 0) + amountCents;
      });
      // Update dashboard
      await db.dashboardMembers.where('id').equals(uid).modify((member) => {
        member.mainBalanceCents = (member.mainBalanceCents || 0) + amountCents;
      });
      // Add deposit transaction
      await db.bankTransactions.add({
        accountId: mainAcct.id, account_id: mainAcct.id,
        amount_cents: amountCents, type: 'deposit',
        description: pd.description || 'Received deposit',
        created_at: now, created_by_user_id: null, created_by_name: '',
      });

      // Process allocations (transfers from main to sub-accounts)
      const pdAllocations = pd.allocations ? JSON.parse(pd.allocations) : [];
      if (allocations && allocations.length > 0) {
        for (const alloc of allocations) {
          const allocCents = alloc.amount_cents;
          if (!allocCents || allocCents <= 0) continue;

          // Debit main account
          await db.bankAccounts.where('id').equals(mainAcct.id).modify((acct) => {
            acct.balance_cents = (acct.balance_cents || 0) - allocCents;
          });
          // Update dashboard (main balance decreases)
          await db.dashboardMembers.where('id').equals(uid).modify((member) => {
            member.mainBalanceCents = (member.mainBalanceCents || 0) - allocCents;
          });
          // Credit sub-account
          await db.bankAccounts.where('id').equals(alloc.account_id).modify((acct) => {
            acct.balance_cents = (acct.balance_cents || 0) + allocCents;
          });

          // Find sub-account name
          const subAcct = await db.bankAccounts.get(alloc.account_id);
          const subName = subAcct?.name || 'Sub-account';

          // Add transfer_out from main
          await db.bankTransactions.add({
            accountId: mainAcct.id, account_id: mainAcct.id,
            amount_cents: -allocCents, type: 'transfer_out',
            description: '', created_at: now,
            created_by_user_id: null, created_by_name: '',
            linked_account_name: subName, linked_account_owner_name: null, linked_account_owner_id: null,
          });
          // Add transfer_in to sub-account
          await db.bankTransactions.add({
            accountId: alloc.account_id, account_id: alloc.account_id,
            amount_cents: allocCents, type: 'transfer_in',
            description: '', created_at: now,
            created_by_user_id: null, created_by_name: '',
            linked_account_name: mainAcct.name, linked_account_owner_name: null, linked_account_owner_id: null,
          });
        }
      }
    }

    // Remove pending deposit + decrement dashboard dot
    await db.pendingDeposits.delete(pdId);
    await db.dashboardMembers.where('id').equals(uid).modify((member) => {
      member.pendingDepositCount = Math.max(0, (member.pendingDepositCount || 0) - 1);
    });

    if (navigator.onLine) {
      try {
        await accountsApi.claimPendingDeposit(userId, pdId, amountCents, allocations);
        const { tryFlush } = await import('../syncEngine.js');
        tryFlush();
        return;
      } catch (err) {
        if (err.response?.status >= 400 && err.response?.status < 500) {
          return;
        }
      }
    }

    await enqueue('CLAIM_PENDING_DEPOSIT', { userId, pdId, amountCents, allocations });
    if (!navigator.onLine) showToast('Saved locally — will sync when online');
  }, [userId, uid]);

  return {
    accounts: accounts || [],
    getTransactionsForAccount,
    pendingDeposits: pendingDeposits || [],
    loading: loading && accounts === undefined,
    createTransaction,
    claimPendingDeposit,
    refresh,
  };
}
