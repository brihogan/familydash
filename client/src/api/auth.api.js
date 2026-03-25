import axios from 'axios';
import { Capacitor } from '@capacitor/core';
import { API_BASE_URL } from './baseUrl.js';

const isNative = Capacitor.isNativePlatform();

// Use plain axios (no auth interceptor) for auth calls
const plainClient = axios.create({ baseURL: API_BASE_URL, withCredentials: true });

// In native apps, store refresh token in localStorage (cookies don't work with CapacitorHttp)
const RT_KEY = 'fd_refresh_token';

function storeRefreshToken(token) {
  if (isNative && token) localStorage.setItem(RT_KEY, token);
}

function getRefreshToken() {
  return isNative ? localStorage.getItem(RT_KEY) : null;
}

function clearRefreshToken() {
  localStorage.removeItem(RT_KEY);
}

// Deduplicate concurrent refresh calls (prevents React StrictMode double-invoke
// from rotating the token twice and invalidating the session)
let refreshPromise = null;

export const authApi = {
  register: (data) => plainClient.post('/auth/register', data).then((r) => {
    storeRefreshToken(r.data.refreshToken);
    return r.data;
  }),
  login: (data) => plainClient.post('/auth/login', data).then((r) => {
    storeRefreshToken(r.data.refreshToken);
    return r.data;
  }),
  refresh: () => {
    if (!refreshPromise) {
      const body = isNative ? { refreshToken: getRefreshToken() } : undefined;
      refreshPromise = plainClient.post('/auth/refresh', body)
        .then((r) => {
          storeRefreshToken(r.data.refreshToken);
          return r.data;
        })
        .finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
  },
  logout: () => {
    const body = isNative ? { refreshToken: getRefreshToken() } : undefined;
    clearRefreshToken();
    return plainClient.post('/auth/logout', body).then((r) => r.data);
  },
};
