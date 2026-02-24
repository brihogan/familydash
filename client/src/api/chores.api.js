import client from './client.js';

export const choresApi = {
  getChores: (userId, date) =>
    client.get(`/users/${userId}/chores`, { params: date ? { date } : {} }).then((r) => r.data),
  completeChore: (userId, logId, date) =>
    client.post(`/users/${userId}/chores/${logId}/complete`, { date }).then((r) => r.data),
  uncompleteChore: (userId, logId, date) =>
    client.post(`/users/${userId}/chores/${logId}/uncomplete`, { date }).then((r) => r.data),

  getTemplates: (userId) => client.get(`/users/${userId}/chore-templates`).then((r) => r.data),
  createTemplate: (userId, data) => client.post(`/users/${userId}/chore-templates`, data).then((r) => r.data),
  updateTemplate: (userId, templateId, data) =>
    client.put(`/users/${userId}/chore-templates/${templateId}`, data).then((r) => r.data),
  reorderTemplates: (userId, items) =>
    client.put(`/users/${userId}/chore-templates/reorder`, { items }).then((r) => r.data),
  deleteTemplate: (userId, templateId) =>
    client.delete(`/users/${userId}/chore-templates/${templateId}`).then((r) => r.data),
};
