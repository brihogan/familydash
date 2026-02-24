import axios from 'axios';

// Use plain axios (no auth interceptor) for auth calls
const plainClient = axios.create({ baseURL: '/api', withCredentials: true });

export const authApi = {
  register: (data) => plainClient.post('/auth/register', data).then((r) => r.data),
  login: (data) => plainClient.post('/auth/login', data).then((r) => r.data),
  refresh: () => plainClient.post('/auth/refresh').then((r) => r.data),
  logout: () => plainClient.post('/auth/logout').then((r) => r.data),
};
