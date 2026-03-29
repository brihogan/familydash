import client from './client.js';

export const adminApi = {
  getDashboard: () => client.get('/admin/dashboard').then((r) => r.data),
  getLoginActivity: (params) => client.get('/admin/login-activity', { params }).then((r) => r.data),
  getFamilyDetail: (familyId) => client.get(`/admin/families/${familyId}`).then((r) => r.data),
};
