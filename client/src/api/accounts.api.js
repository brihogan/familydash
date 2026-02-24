import client from './client.js';

export const accountsApi = {
  getAccounts: (userId) => client.get(`/users/${userId}/accounts`).then((r) => r.data),
  createAccount: (userId, data) => client.post(`/users/${userId}/accounts`, data).then((r) => r.data),
  updateAccount: (userId, accountId, data) =>
    client.patch(`/users/${userId}/accounts/${accountId}`, data).then((r) => r.data),

  getTransactions: (userId, accountId, params) =>
    client.get(`/users/${userId}/accounts/${accountId}/transactions`, { params }).then((r) => r.data),
  createTransaction: (userId, accountId, data) =>
    client.post(`/users/${userId}/accounts/${accountId}/transactions`, data).then((r) => r.data),

  getRecurringRules: (userId) => client.get(`/users/${userId}/recurring`).then((r) => r.data),
  createRecurringRule: (userId, data) => client.post(`/users/${userId}/recurring`, data).then((r) => r.data),
  updateRecurringRule: (userId, ruleId, data) =>
    client.put(`/users/${userId}/recurring/${ruleId}`, data).then((r) => r.data),
  deleteRecurringRule: (userId, ruleId) =>
    client.delete(`/users/${userId}/recurring/${ruleId}`).then((r) => r.data),
};
