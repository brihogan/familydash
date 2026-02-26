import client from './client.js';

export const familyApi = {
  getFamily: () => client.get('/family').then((r) => r.data),
  getFamilyAccounts: () => client.get('/family/accounts').then((r) => r.data),
  addUser: (data) => client.post('/family/users', data).then((r) => r.data),
  updateUser: (id, data) => client.put(`/family/users/${id}`, data).then((r) => r.data),
  deactivateUser: (id) => client.delete(`/family/users/${id}`).then((r) => r.data),
  deleteUserPermanently: (id) => client.delete(`/family/users/${id}/permanent`).then((r) => r.data),
  reorderUsers: (order) => client.put('/family/users/reorder', { order }).then((r) => r.data),
  updateEmoji: (id, emoji) => client.patch(`/family/users/${id}/emoji`, { avatar_emoji: emoji }).then((r) => r.data),
  updateColor: (id, color) => client.patch(`/family/users/${id}/color`, { avatar_color: color }).then((r) => r.data),
  getSettings: () => client.get('/family/settings').then((r) => r.data),
  updateSettings: (data) => client.patch('/family/settings', data).then((r) => r.data),
};
