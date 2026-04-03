import client from './client.js';

export const turnsApi = {
  getTurns: () => client.get('/family/turns').then((r) => r.data),
  getTurn: (id) => client.get(`/family/turns/${id}`).then((r) => r.data),
  createTurn: (data) => client.post('/family/turns', data).then((r) => r.data),
  updateTurn: (id, data) => client.put(`/family/turns/${id}`, data).then((r) => r.data),
  deleteTurn: (id) => client.delete(`/family/turns/${id}`).then((r) => r.data),
  getVisibleTurns: () => client.get('/family/turns/visible').then((r) => r.data),
  logTurn: (id) => client.post(`/family/turns/${id}/log`).then((r) => r.data),
  getTurnLogs: (id) => client.get(`/family/turns/${id}/logs`).then((r) => r.data),
};
