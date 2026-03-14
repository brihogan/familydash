import Dexie from 'dexie';

const db = new Dexie('familyDashboard');

db.version(1).stores({
  dashboardMembers: 'id, familyId',
  choreTemplates:   'id, userId',
  choreLogs:        'id, [userId+logDate]',
  familyMembers:    'id, familyId, role',
  familySettings:   'familyId',
  cachedSession:    'userId',
  mutationQueue:    '++id, status',
  syncMeta:         'key',
});

db.version(2).stores({
  ticketLedger:     '++id, userId, created_at',
});

db.version(3).stores({
  rewards:            'id, familyId',
  rewardRedemptions:  '++id, userId, created_at',
});

db.version(4).stores({
  bankAccounts:       'id, userId',
  bankTransactions:   '++id, accountId, created_at',
  pendingDeposits:    'id, userId',
});

db.version(5).stores({
  overviewCache:      'userId',
  activityCache:      'userId',
});

export default db;
