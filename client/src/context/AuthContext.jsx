import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { authApi } from '../api/auth.api.js';
import { setTokenGetter, setRefreshHandler } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Register the token getter so the axios interceptor can read the latest token
  useEffect(() => {
    setTokenGetter(() => accessToken);
  }, [accessToken]);

  // Register the refresh handler once on mount
  useEffect(() => {
    setRefreshHandler(async () => {
      const data = await authApi.refresh();
      setAccessToken(data.accessToken);
      setUser(userFromToken(data.accessToken));
      return data.accessToken;
    });
  }, []);

  // Attempt silent refresh on mount
  useEffect(() => {
    authApi.refresh()
      .then((data) => {
        setAccessToken(data.accessToken);
        setUser(userFromToken(data.accessToken));
      })
      .catch(() => {
        // No valid refresh token — stay logged out
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (credentials) => {
    const data = await authApi.login(credentials);
    setAccessToken(data.accessToken);
    const user = userFromToken(data.accessToken);
    setUser(user);
    return user;
  }, []);

  const register = useCallback(async (info) => {
    const data = await authApi.register(info);
    setAccessToken(data.accessToken);
    const user = userFromToken(data.accessToken);
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore errors on logout
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  // Called by axios interceptor when a 401 triggers a refresh
  const refreshToken = useCallback(async () => {
    const data = await authApi.refresh();
    setAccessToken(data.accessToken);
    setUser(userFromToken(data.accessToken));
    return data.accessToken;
  }, []);

  // Patch local user state (e.g. after emoji change) without a full token refresh
  const patchUser = useCallback((updates) => {
    setUser((prev) => prev ? { ...prev, ...updates } : prev);
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, login, logout, register, refreshToken, patchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

function parseJwt(token) {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const json = decodeURIComponent(
    atob(base64)
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
  return JSON.parse(json);
}

function userFromToken(token) {
  const p = parseJwt(token);
  return {
    id: p.userId,
    familyId: p.familyId,
    role: p.role,
    name: p.name,
    avatarColor: p.avatarColor,
    avatarEmoji: p.avatarEmoji || null,
  };
}
