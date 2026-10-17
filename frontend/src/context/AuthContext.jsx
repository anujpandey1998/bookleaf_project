import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // restoring session
  const [authError, setAuthError] = useState('');
  const authVersion = useRef(0);

  const logout = useCallback(async () => {
    await api.logout();
    authVersion.current += 1;
    setUser(null);
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password);
    authVersion.current += 1;
    setAuthError('');
    setUser(data.user);
    setLoading(false);
    return data.user;
  }, []);

  const signup = useCallback(async (name, email, password) => {
    const data = await api.signup(name, email, password);
    authVersion.current += 1;
    setAuthError('');
    setUser(data.user);
    setLoading(false);
    return data.user;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const restoreVersion = authVersion.current;
    async function restore() {
      try {
        const me = await api.me();
        if (!cancelled && authVersion.current === restoreVersion) setUser(me);
      } catch (error) {
        if (!cancelled && authVersion.current === restoreVersion) setUser(null);
        if (!cancelled && authVersion.current === restoreVersion && error.status !== 401) setAuthError(error.message);
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
