import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, tokenStore } from './api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!tokenStore.get());

  const logout = useCallback(() => { tokenStore.clear(); setUser(null); }, []);

  useEffect(() => {
    if (!tokenStore.get()) return;
    api('/auth/me').then(setUser).catch(() => tokenStore.clear()).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    window.addEventListener('orgflow:logout', logout);
    return () => window.removeEventListener('orgflow:logout', logout);
  }, [logout]);

  const login = async (email, password) => {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    tokenStore.set(data.token);
    setUser(data.user);
  };

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}
