import { create } from 'zustand';
import api from '../services/api';
import { message } from 'antd';

export const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('capa_user') || 'null'),
  token: localStorage.getItem('capa_token') || null,
  isAuthenticated: !!localStorage.getItem('capa_token'),

  login: async (username, password) => {
    const response = await api.post('/auth/login', { username, password });
    const { token, user } = response.data;
    localStorage.setItem('capa_token', token);
    localStorage.setItem('capa_user', JSON.stringify(user));
    set({ user, token, isAuthenticated: true });
    message.success(`欢迎, ${user.name}!`);
    return user;
  },

  logout: () => {
    localStorage.removeItem('capa_token');
    localStorage.removeItem('capa_user');
    set({ user: null, token: null, isAuthenticated: false });
    message.info('已退出登录');
  },

  fetchCurrentUser: async () => {
    const response = await api.get('/auth/me');
    set({ user: response.data.user });
    return response.data.user;
  }
}));

export const useUserStore = create((set) => ({
  users: [],
  loading: false,

  fetchUsers: async () => {
    set({ loading: true });
    try {
      const response = await api.get('/auth/users');
      set({ users: response.data.users });
    } finally {
      set({ loading: false });
    }
  },

  fetchUsersByRole: async (role) => {
    const response = await api.get(`/auth/users/by-role/${role}`);
    return response.data.users;
  }
}));
