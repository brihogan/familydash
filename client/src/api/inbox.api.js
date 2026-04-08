import client from './client.js';

export const inboxApi = {
  getInbox:            ()    => client.get('/inbox').then((r) => r.data),
  getInboxCount:       ()    => client.get('/inbox/count').then((r) => r.data),
  approve:             (data)=> client.post('/inbox/approve', data).then((r) => r.data),
  deny:                (data)=> client.post('/inbox/deny',    data).then((r) => r.data),
  dismissNotifications:(ids) => client.post('/inbox/notifications/dismiss', { notification_ids: ids }).then((r) => r.data),
};
