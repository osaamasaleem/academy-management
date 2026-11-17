import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../api/axiosClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const response = await apiClient.get('/auth/me');
      setUser(response.data.data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  const login = async (username, password) => {
    const response = await apiClient.post('/auth/login', { username, password });
    setUser(response.data.data.user);
    return response.data.data.user;
  };

  const logout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      setUser(null);
    }
  };

  const changePassword = async (current_password, new_password) => {
    const response = await apiClient.post('/auth/change-password', {
      current_password,
      new_password
    });
    return response.data.data;
  };

  const hasPermission = (flag) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return Boolean(user.permissions?.[flag]);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        changePassword,
        hasPermission,
        refreshUser: fetchCurrentUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
