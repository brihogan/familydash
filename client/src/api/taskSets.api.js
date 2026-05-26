import client from './client.js';

export const taskSetsApi = {
  getTaskSets:   ()                    => client.get('/family/task-sets').then((r) => r.data),
  getTaskSet:    (id)                  => client.get(`/family/task-sets/${id}`).then((r) => r.data),
  createTaskSet: (data)                => client.post('/family/task-sets', data).then((r) => r.data),
  updateTaskSet: (id, data)            => client.put(`/family/task-sets/${id}`, data).then((r) => r.data),
  deleteTaskSet: (id)                  => client.delete(`/family/task-sets/${id}`).then((r) => r.data),

  createStep:    (setId, data)         => client.post(`/family/task-sets/${setId}/steps`, data).then((r) => r.data),
  updateStep:    (setId, stepId, data) => client.put(`/family/task-sets/${setId}/steps/${stepId}`, data).then((r) => r.data),
  deleteStep:    (setId, stepId)       => client.delete(`/family/task-sets/${setId}/steps/${stepId}`).then((r) => r.data),
  reorderSteps:  (setId, order)        => client.patch(`/family/task-sets/${setId}/steps/reorder`, { order }).then((r) => r.data),
  uploadStepImage: (setId, stepId, file) => {
    const form = new FormData();
    form.append('image', file);
    return client.post(`/family/task-sets/${setId}/steps/${stepId}/image`, form).then((r) => r.data);
  },
  deleteStepImage: (setId, stepId)     => client.delete(`/family/task-sets/${setId}/steps/${stepId}/image`).then((r) => r.data),

  getAssignments:  (setId)                     => client.get(`/family/task-sets/${setId}/assignments`).then((r) => r.data),
  setAssignments:  (setId, userIds)            => client.put(`/family/task-sets/${setId}/assignments`, { userIds }).then((r) => r.data),
  getHistory:      (setId)                     => client.get(`/family/task-sets/${setId}/history`).then((r) => r.data),

  getUserTaskSets: (userId, { archived } = {}) =>
    client.get(`/users/${userId}/task-assignments`, { params: archived ? { archived } : {} }).then((r) => r.data),
  archiveAssignment:   (userId, taskSetId) => client.post(`/users/${userId}/task-assignments/${taskSetId}/archive`).then((r) => r.data),
  unarchiveAssignment: (userId, taskSetId) => client.post(`/users/${userId}/task-assignments/${taskSetId}/unarchive`).then((r) => r.data),
  setPinned:           (userId, taskSetId, pinned) => client.patch(`/users/${userId}/task-assignments/${taskSetId}/pin`, { pinned }).then((r) => r.data),
  getUserTaskSet:  (userId, taskSetId)         => client.get(`/users/${userId}/task-assignments/${taskSetId}`).then((r) => r.data),
  toggleStep:      (userId, taskSetId, stepId, undo = false, inputResponse = null) => client.post(`/users/${userId}/task-assignments/${taskSetId}/steps/${stepId}/toggle`, { ...(undo ? { undo: true } : {}), ...(inputResponse ? { input_response: inputResponse } : {}) }).then((r) => r.data),
  // PATCH the user-chosen badge link on an award step. Pass `null` to clear
  // the link (lets the step fall back to category auto-pick or become
  // un-picked depending on the step's config).
  linkStep:        (userId, taskSetId, stepId, linkedTaskSetId) => client.patch(`/users/${userId}/task-assignments/${taskSetId}/steps/${stepId}/link`, { linkedTaskSetId }).then((r) => r.data),
  updateAwardState:(userId, taskSetId, state)  => client.patch(`/users/${userId}/awards/${taskSetId}/state`, state).then((r) => r.data),
  // count_at_level award progress (WOW / Major / Gem). Returns { min, count,
  // level, isComplete, completed: [{task_set_id, badge_id, name, image_file,
  // emoji, completed_at}, …] } — used by CountAtLevelAwardDetail.
  getAwardBadgeProgress: (userId, taskSetId) => client.get(`/users/${userId}/awards/${taskSetId}/badge-progress`).then((r) => r.data),
};
