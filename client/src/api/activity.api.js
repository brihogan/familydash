import client from './client.js';

export const activityApi = {
  getUserActivity: (userId, params) =>
    client.get(`/users/${userId}/activity`, { params }).then((r) => r.data),
  getUserActivityByDate: (userId, date) =>
    client.get(`/users/${userId}/activity`, { params: { date, limit: 100 } }).then((r) => r.data),
  getFamilyActivity: (params) =>
    client.get('/family/activity', { params }).then((r) => r.data),
};
