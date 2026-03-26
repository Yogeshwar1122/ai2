import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('lockbox_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config.url?.includes('/auth/')) {
      localStorage.removeItem('lockbox_token');
      localStorage.removeItem('lockbox_user');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

// Auth
export const register = (data) => api.post('/auth/register', data);
export const login = (data) => api.post('/auth/login', data);
export const verifyOTP = (data) => api.post('/auth/verify-otp', data);
export const verifyTOTP = (data) => api.post('/auth/verify-totp', data);
export const verifyPIN = (data) => api.post('/auth/verify-pin', data);
export const setupTOTP = () => api.post('/auth/setup-totp');
export const confirmTOTP = (code) => api.post('/auth/confirm-totp', { code });
export const setupPIN = (pin) => api.post('/auth/setup-pin', { pin });
export const getMe = () => api.get('/auth/me');
export const logout = () => api.post('/auth/logout');
export const resendOTP = (email) => api.post('/auth/resend-otp', { email });

// Devices
export const getDevices = () => api.get('/devices');
export const trustDevice = (data) => api.post('/devices/trust', data);
export const removeDevice = (deviceId) => api.delete(`/devices/${deviceId}`);

// Security
export const getSecurityLogs = () => api.get('/security/logs');
export const getSessions = () => api.get('/security/sessions');
export const revokeSession = (sessionId) => api.delete(`/security/sessions/${sessionId}`);
export const getAnalytics = () => api.get('/security/analytics');
export const getThreats = () => api.get('/security/threats');

// Settings
export const getLockConfig = () => api.get('/settings/lock-config');
export const updateLockConfig = (data) => api.put('/settings/lock-config', data);
export const changePassword = (data) => api.put('/settings/password', data);

export default api;
