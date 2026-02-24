import client from './client.js';

export const rewardsApi = {
  getRewards: () => client.get('/family/rewards').then((r) => r.data),
  createReward: (data) => client.post('/family/rewards', data).then((r) => r.data),
  updateReward: (rewardId, data) => client.put(`/family/rewards/${rewardId}`, data).then((r) => r.data),
  deleteReward: (rewardId) => client.delete(`/family/rewards/${rewardId}`).then((r) => r.data),

  redeemReward: (userId, rewardId) =>
    client.post(`/users/${userId}/rewards/redeem`, { reward_id: rewardId }).then((r) => r.data),
  getRedemptions: (params) =>
    client.get('/family/redemptions', { params }).then((r) => r.data),
};
