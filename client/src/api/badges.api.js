import client from './client.js';

export const badgesApi = {
  getBadges:         (params) =>
    client.get('/badges', { params }).then((r) => r.data),

  getBadge:          (id, level) =>
    client.get(`/badges/${id}`, { params: level ? { level } : {} }).then((r) => r.data),

  getBadgeOptionals: (badgeId) =>
    client.get(`/badges/${badgeId}/optionals`).then((r) => r.data),

  enroll:            (userId, badgeId, selectedOptionalIds) =>
    client.post(`/users/${userId}/badges/enroll`, { badgeId, selectedOptionalIds }).then((r) => r.data),

  swapOptional:      (userId, taskSetId, removeStepId, addOptionalReqId) =>
    client.patch(`/users/${userId}/task-assignments/${taskSetId}/optional-swap`, {
      removeStepId,
      addOptionalReqId,
    }).then((r) => r.data),

  addOptional:       (userId, taskSetId, addOptionalReqId) =>
    client.post(`/users/${userId}/task-assignments/${taskSetId}/add-optional`, {
      addOptionalReqId,
    }).then((r) => r.data),

  bookmark:          (userId, badgeId) =>
    client.post(`/users/${userId}/badges/${badgeId}/bookmark`).then((r) => r.data),
  unbookmark:        (userId, badgeId) =>
    client.delete(`/users/${userId}/badges/${badgeId}/bookmark`).then((r) => r.data),
};
