import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { api, getToken, setToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // restoring session

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (!getToken()) { setLoading(false); return; }
      try {
        const me = await api.me();
        if (!cancelled) setUser(me);
      } catch {
        setToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    restore();
    const onUnauthorized = () => setUser(null);
    window.addEventListener('bookleaf:unauthorized', onUnauthorized);
    return () => {
      cancelled = true;
      window.removeEventListener('bookleaf:unauthorized', onUnauthorized);
    };
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
