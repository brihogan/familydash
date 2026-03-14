import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPiggyBank, faPlus } from '@fortawesome/free-solid-svg-icons';
import { accountsApi } from '../api/accounts.api.js';
import { useAuth } from '../context/AuthContext.jsx';
import useOfflineBank from '../offline/hooks/useOfflineBank.js';
import useOfflineFamily from '../offline/hooks/useOfflineFamily.js';
import AccountCard from '../components/bank/AccountCard.jsx';
import TransactionList from '../components/bank/TransactionList.jsx';
import UnifiedBankDialog from '../components/bank/UnifiedBankDialog.jsx';
import MoneyPopover from '../components/bank/MoneyPopover.jsx';
import RecurringRuleList from '../components/bank/RecurringRuleList.jsx';
import RecurringRuleForm from '../components/bank/RecurringRuleForm.jsx';
import Modal from '../components/shared/Modal.jsx';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import KidProfilePicker from '../components/shared/KidProfilePicker.jsx';
import { formatCents } from '../utils/formatCents.js';

const DATE_OPTIONS = [
  { key: 'today',     label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d',        label: 'Last 7 days' },
  { key: 'all',       label: 'All' },
];

const SELECT_CLS = 'border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400';

function localMidnightISO(offsetDays = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (offsetDays) d.setDate(d.getDate() - offsetDays);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

const TX_TYPE_OPTIONS = [
  { key: 'all',         label: 'All' },
  { key: 'deposits',    label: 'Deposits' },
  { key: 'withdrawals', label: 'Withdrawals' },
  { key: 'transfers',   label: 'Transfers' },
];

const TX_TYPE_GROUPS = {
  transfers:   ['transfer_in', 'transfer_out'],
  deposits:    ['deposit', 'allowance', 'manual_adjustment'],
  withdrawals: ['withdraw'],
};

const ACCOUNT_TYPES = ['savings', 'charity', 'custom'];
const ALL_ACCOUNT_TYPES = ['main', 'savings', 'charity', 'custom'];

function EditAccountForm({ account, onSave, onCancel, loading }) {
  const [name, setName] = useState(account?.name || '');
  const [type, setType] = useState(account?.type || 'savings');
  const [error, setError] = useState('');
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    setError('');
    await onSave({ name: name.trim(), type });
  };
  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Account Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={100}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:bg-gray-700 dark:text-gray-200" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
        <select value={type} onChange={(e) => setType(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:bg-gray-700 dark:text-gray-200">
          {ALL_ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={loading}
          className="flex-1 bg-brand-500 hover:bg-brand-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
          {loading ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}

function AddAccountForm({ onSave, onCancel, loading }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('savings');
  const [error, setError] = useState('');
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    setError('');
    await onSave({ name: name.trim(), type });
  };
  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Account Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Tithing, Savings, Disney Fund"
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:bg-gray-700 dark:text-gray-200"
          maxLength={100} />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
        <select value={type} onChange={(e) => setType(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:bg-gray-700 dark:text-gray-200">
          {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={loading}
          className="flex-1 bg-brand-500 hover:bg-brand-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
          {loading ? 'Creating…' : 'Create Account'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function KidBankPage() {
  const { userId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isParent = user?.role === 'parent';

  const [selectedAccount, setSelectedAccount] = useState(null);
  const [rules, setRules] = useState([]);
  const [txModal, setTxModal] = useState(null);
  const [ruleModal, setRuleModal] = useState(false);
  const [addAccountModal, setAddAccountModal] = useState(false);
  const [addAccountLoading, setAddAccountLoading] = useState(false);
  const [renameAccount, setRenameAccount] = useState(null);
  const [renameLoading, setRenameLoading] = useState(false);
  const [dateKey, setDateKey] = useState('today');
  const [txTypeKey, setTxTypeKey] = useState('all');
  const [error, setError] = useState('');
  const [receivePopover, setReceivePopover] = useState(null);

  // Offline hooks
  const { accounts, getTransactionsForAccount, pendingDeposits, loading, claimPendingDeposit, refresh } =
    useOfflineBank(userId);
  const { kids, members } = useOfflineFamily();

  const member = useMemo(
    () => members.find((m) => m.id === parseInt(userId, 10)),
    [members, userId],
  );
  const memberName = member?.name || '';
  const memberRole = member?.role || null;
  const allowTransfers = member?.allow_transfers ?? true;
  const allowWithdraws = member?.allow_withdraws ?? true;
  const requireCurrencyWork = !!member?.require_currency_work;

  // Keep selected account in sync with accounts list
  useEffect(() => {
    if (!accounts.length) return;
    setSelectedAccount((prev) => {
      if (!prev) return accounts[0] ?? null;
      return accounts.find((a) => a.id === prev.id) ?? accounts[0] ?? null;
    });
  }, [accounts]);

  // Reset on user change
  useEffect(() => {
    setSelectedAccount(null);
    setError('');
  }, [userId]);

  // Transactions for selected account, filtered client-side
  const transactions = useMemo(() => {
    if (!selectedAccount) return [];
    let txs = getTransactionsForAccount(selectedAccount.id);

    // Date filter
    if (dateKey === 'today') {
      const from = localMidnightISO(0);
      txs = txs.filter((t) => t.created_at >= from);
    } else if (dateKey === 'yesterday') {
      const from = localMidnightISO(1);
      const to = localMidnightISO(0);
      txs = txs.filter((t) => t.created_at >= from && t.created_at < to);
    } else if (dateKey === '7d') {
      const from = localMidnightISO(6);
      txs = txs.filter((t) => t.created_at >= from);
    }

    return txs;
  }, [selectedAccount, getTransactionsForAccount, dateKey]);

  // Fetch recurring rules (online-only feature)
  const fetchRules = useCallback(async () => {
    if (!isParent) return;
    try {
      const data = await accountsApi.getRecurringRules(userId);
      setRules(data.rules);
    } catch {}
  }, [userId, isParent]);
  useEffect(() => { fetchRules(); }, [fetchRules]);

  // Auto-open first pending deposit when navigated from dashboard indicator
  useEffect(() => {
    if (location.state?.openReceive && pendingDeposits.length > 0 && !receivePopover) {
      setReceivePopover(pendingDeposits[0]);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state?.openReceive, pendingDeposits, receivePopover, navigate, location.pathname]);

  const handleAddAccount = async (data) => {
    setAddAccountLoading(true);
    try {
      await accountsApi.createAccount(userId, data);
      setAddAccountModal(false);
      refresh();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create account.');
    } finally {
      setAddAccountLoading(false);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    await accountsApi.deleteRecurringRule(userId, ruleId);
    fetchRules();
  };

  const handleEditAccount = async ({ name, type }) => {
    setRenameLoading(true);
    try {
      await accountsApi.updateAccount(userId, renameAccount.id, { name, type });
      setRenameAccount(null);
      refresh();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update account.');
    } finally {
      setRenameLoading(false);
    }
  };

  if (loading) return <LoadingSkeleton rows={4} />;

  const displayTx = txTypeKey === 'all'
    ? transactions
    : transactions.filter((tx) => TX_TYPE_GROUPS[txTypeKey]?.includes(tx.type));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <FontAwesomeIcon icon={faPiggyBank} className="text-brand-500 text-2xl shrink-0" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
            {isParent ? `${memberName || '...'}'s Bank` : 'My Bank'}
          </h1>
        </div>
        {isParent && memberRole !== 'parent' && (
          <button onClick={() => setAddAccountModal(true)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm rounded-lg font-medium transition-colors"
            aria-label="Add sub-account">
            <FontAwesomeIcon icon={faPlus} />
          </button>
        )}
      </div>
      {isParent && kids.length > 1 && (
        <KidProfilePicker kids={kids} currentId={userId} routePrefix="/bank" />
      )}

      {memberRole === 'parent' && (
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-6 mb-4 text-center text-sm text-gray-500 dark:text-gray-400">
          Parents don't have bank accounts — this feature is for kids only.
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>
      )}

      {memberRole !== 'parent' && (
        <>
          {/* Accounts row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
            {accounts.map((a) => (
              <AccountCard key={a.id} account={a} selected={selectedAccount?.id === a.id}
                onClick={setSelectedAccount} onEdit={isParent ? setRenameAccount : undefined} />
            ))}
          </div>

          {/* Pending deposits banner */}
          {pendingDeposits.length > 0 && (
            <div className="mb-4 space-y-2">
              {pendingDeposits.map((pd) => (
                <button key={pd.id} onClick={() => setReceivePopover(pd)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border-2 border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                  <div className="text-left">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Money to receive!</p>
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {formatCents(pd.amount_cents)} — {pd.account_name}
                      {pd.description ? ` · ${pd.description}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-sm font-semibold">Receive</span>
                </button>
              ))}
            </div>
          )}

          {/* Action buttons */}
          {selectedAccount && (
            <div className="grid grid-cols-2 sm:flex gap-2 mb-6">
              {isParent && (
                <button onClick={() => setTxModal('deposit')}
                  className="py-2 px-4 bg-green-500 hover:bg-green-600 text-white text-sm rounded-lg font-medium transition-colors">
                  + Deposit
                </button>
              )}
              {(isParent || allowWithdraws) && (
                <button onClick={() => setTxModal('withdraw')}
                  className="py-2 px-4 bg-brand-500 hover:bg-brand-600 text-white text-sm rounded-lg font-medium transition-colors">
                  Withdraw
                </button>
              )}
              {allowTransfers && (
                <button onClick={() => setTxModal('transfer')}
                  className="py-2 px-4 bg-purple-500 hover:bg-purple-600 text-white text-sm rounded-lg font-medium transition-colors">
                  Transfer
                </button>
              )}
              {isParent && (
                <button onClick={() => setRuleModal(true)}
                  className="py-2 px-4 border border-gray-300 dark:border-gray-600 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors sm:ml-auto">
                  + Recurring Rule
                </button>
              )}
            </div>
          )}

          {/* Transactions */}
          {selectedAccount && (
            <div className="mb-6">
              <div className="mb-3">
                <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Transactions — {selectedAccount.name}
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400 dark:text-gray-500">Date</span>
                    <select className={SELECT_CLS} value={dateKey} onChange={(e) => setDateKey(e.target.value)}>
                      {DATE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    {TX_TYPE_OPTIONS.map((o) => (
                      <button key={o.key} onClick={() => setTxTypeKey(o.key)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          txTypeKey === o.key
                            ? 'bg-brand-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}>{o.label}</button>
                    ))}
                  </div>
                </div>
              </div>
              <TransactionList transactions={displayTx} viewingUserId={userId} />
            </div>
          )}

          {/* Recurring rules (parent only) */}
          {isParent && rules.length > 0 && (
            <div>
              <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-3">Recurring Rules</h2>
              <RecurringRuleList rules={rules} onDelete={handleDeleteRule} />
            </div>
          )}

          {/* Deposit / Withdraw / Transfer modal */}
          <UnifiedBankDialog
            open={!!txModal}
            onClose={() => setTxModal(null)}
            userId={userId}
            initialMode={txModal || 'deposit'}
            sourceAccount={selectedAccount}
            userAccounts={accounts}
            requireCurrencyWork={requireCurrencyWork}
            onSuccess={() => {}}
          />

          {/* Edit account modal */}
          <Modal open={!!renameAccount} onClose={() => setRenameAccount(null)} title="Edit Account">
            <EditAccountForm account={renameAccount} onSave={handleEditAccount}
              onCancel={() => setRenameAccount(null)} loading={renameLoading} />
          </Modal>

          {/* Add sub-account modal */}
          <Modal open={addAccountModal} onClose={() => setAddAccountModal(false)} title="Add Sub-account">
            <AddAccountForm onSave={handleAddAccount} onCancel={() => setAddAccountModal(false)}
              loading={addAccountLoading} />
          </Modal>

          {/* Receive pending deposit popover */}
          {receivePopover && (
            <MoneyPopover
              open={!!receivePopover}
              onClose={() => setReceivePopover(null)}
              account={{ name: 'Receiving money', balance_cents: receivePopover.amount_cents }}
              receiveMode
              receiveAmountCents={receivePopover.amount_cents}
              receiveAllocations={receivePopover.allocations ? JSON.parse(receivePopover.allocations) : []}
              onReceiveConfirm={async (cents, allocResults) => {
                await claimPendingDeposit(receivePopover.id, cents, allocResults);
                setReceivePopover(null);
              }}
            />
          )}

          {/* Recurring rule modal */}
          <Modal open={ruleModal} onClose={() => setRuleModal(false)} title="Add Recurring Rule">
            <RecurringRuleForm
              accounts={accounts}
              userAccounts={accounts}
              requireCurrencyWork={requireCurrencyWork}
              loading={false}
              onCancel={() => setRuleModal(false)}
              onSave={async (data) => {
                await accountsApi.createRecurringRule(userId, data);
                setRuleModal(false);
                fetchRules();
              }}
            />
          </Modal>
        </>
      )}
    </div>
  );
}
