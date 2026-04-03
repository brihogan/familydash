import client from './client.js';

export const claudeApi = {
  getWsTicket: (userId) => client.post(`/claude/${userId}/ws-ticket`).then((r) => r.data),
  listApps: () => client.get('/claude/apps').then((r) => r.data),
  getStatus: (userId) => client.get(`/claude/${userId}/status`).then((r) => r.data),
  start: (userId) => client.post(`/claude/${userId}/start`).then((r) => r.data),
  stop: (userId) => client.post(`/claude/${userId}/stop`).then((r) => r.data),
};
