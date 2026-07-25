import client from './client.js';

export const aiTutorApi = {
  // `open` costs a model call (it generates the greeting), so only pass it when
  // the kid actually opened the panel — never just to render a step row.
  getThread: (userId, stepId, { open = false } = {}) =>
    client.get(`/ai/users/${userId}/steps/${stepId}/thread`, {
      params: open ? { open: 1 } : {},
    }).then((r) => r.data),

  // `source` records whether they tapped a suggested follow-up or typed it
  // themselves — used only to distinguish the two when reading back a thread.
  ask: (userId, stepId, text, kind = 'chat', source = undefined) =>
    client.post(`/ai/users/${userId}/steps/${stepId}/messages`, { text, kind, source }).then((r) => r.data),

  // Follow a cross-badge pointer: resolves the kid's own enrolment in the
  // target badge, picks the best-matching step, and seeds its thread.
  handoff: (userId, fromStepId, badgeId) =>
    client.post(`/ai/users/${userId}/handoff`, { fromStepId, badgeId }).then((r) => r.data),

  // Full transcript of one conversation. A parent reading a flagged thread
  // marks it seen server-side.
  getConversation: (userId, threadId) =>
    client.get(`/ai/users/${userId}/threads/${threadId}`).then((r) => r.data),

  // Flagged conversations across the family that a parent hasn't opened yet.
  // Returns an empty list for a kid.
  getConcerns: () =>
    client.get('/ai/concerns').then((r) => r.data),

  getWonders: (userId) =>
    client.get(`/ai/users/${userId}/wonders`).then((r) => r.data),

  refreshContext: (userId) =>
    client.post(`/ai/users/${userId}/context/refresh`).then((r) => r.data),
};
