import client from './client.js';

export const commonChoresApi = {
  getAll: () => client.get('/family/common-chores').then((r) => r.data),
  create: (data) => client.post('/family/common-chores', data).then((r) => r.data),
  update: (id, data) => client.put(`/family/common-chores/${id}`, data).then((r) => r.data),
  remove: (id) => client.delete(`/family/common-chores/${id}`).then((r) => r.data),
  reorder: (items) => client.put('/family/common-chores/reorder', { items }).then((r) => r.data),
  assign: (id, userId, assigned) =>
    client.post(`/family/common-chores/${id}/assign`, { userId, assigned }).then((r) => r.data),
};
