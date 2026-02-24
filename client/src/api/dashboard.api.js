import client from './client.js';

export const dashboardApi = {
  getDashboard: () => client.get('/dashboard').then((r) => r.data),
};
