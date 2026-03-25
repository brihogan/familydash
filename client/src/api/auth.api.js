import axios from 'axios';
import { API_BASE_URL } from './baseUrl.js';

// Use plain axios (no auth interceptor) for auth calls
const plainClient = axios.create({ baseURL: API_BASE_URL, withCredentials: true });

// Deduplicate concurrent refresh calls (prevents React StrictMode double-invoke
// from rotating the token twice and invalidating the session)
let refreshPromise = null;

export const authApi = {
  register: (data) => plainClient.post('/auth/register', data).then((r) => r.data),
  login: (data) => plainClient.post('/auth/login', data).then((r) => r.data),
  refresh: () => {
    if (!refreshPromise) {
      refreshPromise = plainClient.post('/auth/refresh')
        .then((r) => r.data)
        .finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
  },
  logout: () => plainClient.post('/auth/logout').then((r) => r.data),
};
