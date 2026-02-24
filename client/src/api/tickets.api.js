import client from './client.js';

export const ticketsApi = {
  getTickets: (userId, params) =>
    client.get(`/users/${userId}/tickets`, { params }).then((r) => r.data),
  adjustTickets: (userId, data) =>
    client.post(`/users/${userId}/tickets/adjust`, data).then((r) => r.data),
};
