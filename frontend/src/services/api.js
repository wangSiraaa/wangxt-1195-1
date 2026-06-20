import axios from 'axios';
import { message } from 'antd';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('capa_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('capa_token');
      localStorage.removeItem('capa_user');
      window.location.href = '/login';
    }
    if (error.response?.data?.error) {
      message.error(error.response.data.error);
    }
    return Promise.reject(error);
  }
);

export default api;
