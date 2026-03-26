import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMe, logout as apiLogout } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('lockbox_token');
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await getMe();
      setUser(res.data);
      setIsAuthenticated(true);
    } catch {
      localStorage.removeItem('lockbox_token');
      localStorage.removeItem('lockbox_user');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const loginUser = (token, userData) => {
    localStorage.setItem('lockbox_token', token);
    localStorage.setItem('lockbox_user', JSON.stringify(userData));
    setUser(userData);
    setIsAuthenticated(true);
  };

  const logoutUser = async () => {
    try { await apiLogout(); } catch {}
    localStorage.removeItem('lockbox_token');
    localStorage.removeItem('lockbox_user');
    setUser(null);
    setIsAuthenticated(false);
  };

  const refreshUser = async () => {
    try {
      const res = await getMe();
      setUser(res.data);
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAuthenticated, loginUser, logoutUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
