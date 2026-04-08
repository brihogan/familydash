import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { authApi } from '../api/auth.api.js';
import { setTokenGetter, setRefreshHandler } from '../api/client.js';
import { cacheSession, getCachedSession, clearDataOnLogout } from '../offline/authOffline.js';
import { prefetchAllData } from '../offline/syncEngine.js';
import { showToast } from '../components/shared/Toast.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOfflineSession, setIsOfflineSession] = useState(false);

  // Register the token getter so the axios interceptor can read the latest token
  useEffect(() => {
    setTokenGetter(() => accessToken);
  }, [accessToken]);

  // Register the refresh handler once on mount. If the refresh itself fails
  // with a 401/403, that means the refresh token is dead (server restarted,
  // session invalidated, etc.) — in that case we need to surface it in the
  // UI, otherwise the offline-first cache silently keeps rendering stale
  // data and the user has no idea they're signed out until a hard refresh.
  // We only clear state on a genuine server rejection; a network error
  // leaves the cached session intact so the user stays usable offline.
  useEffect(() => {
    setRefreshHandler(async () => {
      try {
        const data = await authApi.refresh();
        setAccessToken(data.accessToken);
        setUser(userFromToken(data.accessToken));
        return data.accessToken;
      } catch (err) {
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          // Functional updater so we only fire the toast on the actual
          // transition from signed-in → signed-out, not on repeated failed
          // requests after we've already cleared state.
          setUser((prev) => {
            if (prev != null) {
              showToast('Signed out — please log in again.', 5000);
            }
            return null;
          });
          setAccessToken(null);
          setIsOfflineSession(false);
          clearDataOnLogout();
        }
        throw err;
      }
    });
  }, []);

  // Attempt silent refresh on mount; fall back to cached session if offline
  useEffect(() => {
    authApi.refresh()
      .then((data) => {
        setAccessToken(data.accessToken);
        const u = userFromToken(data.accessToken);
        setUser(u);
        cacheSession(u);
        prefetchAllData(u);
      })
      .catch(async () => {
        // Network error or no valid refresh token — try offline fallback
        const cached = await getCachedSession();
        if (cached) {
          setUser({
            id: cached.userId,
            familyId: cached.familyId,
            role: cached.role,
            name: cached.name,
            avatarColor: cached.avatarColor,
            avatarEmoji: cached.avatarEmoji,
          });
          setIsOfflineSession(true);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (credentials) => {
    const data = await authApi.login(credentials);
    setAccessToken(data.accessToken);
    const u = userFromToken(data.accessToken);
    setUser(u);
    setIsOfflineSession(false);
    cacheSession(u);
    prefetchAllData(u);
    return u;
  }, []);

  const register = useCallback(async (info) => {
    const data = await authApi.register(info);
    setAccessToken(data.accessToken);
    const u = userFromToken(data.accessToken);
    setUser(u);
    cacheSession(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore errors on logout
    }
    setAccessToken(null);
    setUser(null);
    setIsOfflineSession(false);
    clearDataOnLogout();
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
    <AuthContext.Provider value={{ user, accessToken, loading, login, logout, register, refreshToken, patchUser, isOfflineSession }}>
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
    isAdmin: !!p.isAdmin,
  };
}
