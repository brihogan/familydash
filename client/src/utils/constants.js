export const ROLES = {
  PARENT: 'parent',
  KID: 'kid',
};

export const ACCOUNT_TYPES = {
  MAIN: 'main',
  SAVINGS: 'savings',
  CHARITY: 'charity',
  CUSTOM: 'custom',
};

export const TRANSACTION_TYPES = {
  DEPOSIT: 'deposit',
  WITHDRAW: 'withdraw',
  TRANSFER_IN: 'transfer_in',
  TRANSFER_OUT: 'transfer_out',
  ALLOWANCE: 'allowance',
  MANUAL_ADJUSTMENT: 'manual_adjustment',
};

export const EVENT_TYPES = {
  CHORE_COMPLETED: 'chore_completed',
  CHORE_UNDONE: 'chore_undone',
  DEPOSIT: 'deposit',
  WITHDRAWAL: 'withdrawal',
  TRANSFER_OUT: 'transfer_out',
  TRANSFER_IN: 'transfer_in',
  ALLOWANCE: 'allowance',
  REWARD_REDEEMED: 'reward_redeemed',
  TICKETS_ADDED: 'tickets_added',
  TICKETS_REMOVED: 'tickets_removed',
};

export const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6',
];
