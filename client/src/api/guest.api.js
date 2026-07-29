import axios from 'axios';
import { API_BASE_URL } from './baseUrl.js';
import client from './client.js';

const TOKEN_KEY = 'famdash.guestToken';

// Guests use a bare axios instance, not the shared `client`. The shared one
// attaches the family access token and runs the silent-refresh interceptor —
// neither of which means anything here, and a guest is not signed into the
// family at all.
const guestClient = axios.create({ baseURL: API_BASE_URL, timeout: 25000 });

guestClient.interceptors.request.use((config) => {
  const token = getGuestToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function getGuestToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setGuestToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* private browsing — token just won't survive a reload */ }
}

export const guestApi = {
  status: () => guestClient.get('/guest/status').then((r) => r.data),
  login: (passcode, name) => guestClient.post('/guest/login', { passcode, name }).then((r) => r.data),
  session: () => guestClient.get('/guest/session').then((r) => r.data),
  getWsTicket: () => guestClient.post('/guest/ws-ticket').then((r) => r.data),
};

// Parent-side controls go through the normal authenticated client.
export const guestAdminApi = {
  getSettings: () => client.get('/guest/settings').then((r) => r.data),
  saveSettings: (data) => client.put('/guest/settings', data).then((r) => r.data),
  getAdminTicket: () => client.post('/guest/admin-ticket').then((r) => r.data),
  nuke: () => client.post('/guest/nuke').then((r) => r.data),
  stop: () => client.post('/guest/stop').then((r) => r.data),
};
