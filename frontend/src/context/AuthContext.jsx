import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // restoring session
  const [authError, setAuthError] = useState('');

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password);
    setAuthError('');
    setUser(data.user);
    return data.user;
  }, []);

  const signup = useCallback(async (name, email, password) => {
    const data = await api.signup(name, email, password);
    setAuthError('');
    setUser(data.user);
    return data.user;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const me = await api.me();
        if (!cancelled) setUser(me);
      } catch (error) {
        if (!cancelled) setUser(null);
        if (!cancelled && error.status !== 401) setAuthError(error.message);
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

  const value = useMemo(() => ({ user, loading, login, signup, logout, authError }), [user, loading, login, signup, logout, authError]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
