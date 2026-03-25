import axios from 'axios';
import { API_BASE_URL } from './baseUrl.js';

let getToken = () => null;
let onRefresh = null;
let isRefreshing = false;
let pendingQueue = [];

export function setTokenGetter(fn) {
  getToken = fn;
}

export function setRefreshHandler(fn) {
  onRefresh = fn;
}

const client = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // send httpOnly cookie
});

// Attach access token to every request
client.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Silent refresh on 401
client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && onRefresh) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return client(original);
        });
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const newToken = await onRefresh();
        pendingQueue.forEach(({ resolve }) => resolve(newToken));
        pendingQueue = [];
        original.headers.Authorization = `Bearer ${newToken}`;
        return client(original);
      } catch (refreshError) {
        pendingQueue.forEach(({ reject }) => reject(refreshError));
        pendingQueue = [];
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);

export default client;
