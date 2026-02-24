import client from './client.js';

export const overviewApi = {
  getOverview: (userId) =>
    client.get(`/users/${userId}/overview`).then((r) => r.data),
};
