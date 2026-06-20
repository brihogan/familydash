import client from './client.js';

export const familyApi = {
  getFamily: () => client.get('/family').then((r) => r.data),
  // Parent-only: task sets 2+ family members share (badges by badge_id, regular
  // sets by task_set_id), each with member avatars + a representative target.
  getSharedTaskSets: () => client.get('/family/shared-task-sets').then((r) => r.data),
  // Pin/unpin a shared task set for the family (pinned ones sort to the top).
  setSharedPin: (kind, refId, pinned) => client.post('/family/shared-pins', { kind, refId, pinned }).then((r) => r.data),
  getFamilyAccounts: () => client.get('/family/accounts').then((r) => r.data),
  addUser: (data) => client.post('/family/users', data).then((r) => r.data),
  updateUser: (id, data) => client.put(`/family/users/${id}`, data).then((r) => r.data),
  deactivateUser: (id) => client.delete(`/family/users/${id}`).then((r) => r.data),
  deleteUserPermanently: (id) => client.delete(`/family/users/${id}/permanent`).then((r) => r.data),
  reorderUsers: (order) => client.put('/family/users/reorder', { order }).then((r) => r.data),
  updateEmoji: (id, emoji) => client.patch(`/family/users/${id}/emoji`, { avatar_emoji: emoji }).then((r) => r.data),
  updateColor: (id, color) => client.patch(`/family/users/${id}/color`, { avatar_color: color }).then((r) => r.data),
  updateMenubar: (id, primary) => client.patch(`/family/users/${id}/menubar`, { primary }).then((r) => r.data),
  getSettings: () => client.get('/family/settings').then((r) => r.data),
  updateSettings: (data) => client.patch('/family/settings', data).then((r) => r.data),
  // Device tokens (Garmin FamDash / embedded read clients) — parent only. The
  // plaintext token is returned only from createDeviceToken.
  listDeviceTokens: () => client.get('/family/device-tokens').then((r) => r.data),
  createDeviceToken: (data) => client.post('/family/device-tokens', data).then((r) => r.data),
  revokeDeviceToken: (id) => client.delete(`/family/device-tokens/${id}`).then((r) => r.data),
  setDeviceTokenWrite: (id, write) => client.patch(`/family/device-tokens/${id}`, { write }).then((r) => r.data),
};
