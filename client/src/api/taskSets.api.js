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

  getAssignments:  (setId)                     => client.get(`/family/task-sets/${setId}/assignments`).then((r) => r.data),
  setAssignments:  (setId, userIds)            => client.put(`/family/task-sets/${setId}/assignments`, { userIds }).then((r) => r.data),
  getHistory:      (setId)                     => client.get(`/family/task-sets/${setId}/history`).then((r) => r.data),

  getUserTaskSets: (userId)                    => client.get(`/users/${userId}/task-assignments`).then((r) => r.data),
  getUserTaskSet:  (userId, taskSetId)         => client.get(`/users/${userId}/task-assignments/${taskSetId}`).then((r) => r.data),
  toggleStep:      (userId, taskSetId, stepId, undo = false, inputResponse = null) => client.post(`/users/${userId}/task-assignments/${taskSetId}/steps/${stepId}/toggle`, { ...(undo ? { undo: true } : {}), ...(inputResponse ? { input_response: inputResponse } : {}) }).then((r) => r.data),
};
