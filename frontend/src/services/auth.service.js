import { apiClient } from './apiClient.js';

// Thin wrapper around the backend `/auth/*` endpoints. Each function returns
// the unwrapped `data` envelope so call sites do not need to know about the
// success envelope. Errors propagate as `ApiError` instances.

const unwrap = (response) => response?.data ?? null;

export const authService = Object.freeze({
  register: (payload) => apiClient.post('/auth/register', payload, { skipAuth: true }).then(unwrap),

  login: (payload) => apiClient.post('/auth/login', payload, { skipAuth: true }).then(unwrap),

  refresh: (refreshToken) =>
    apiClient.post('/auth/refresh', { refreshToken }, { skipAuth: true }).then(unwrap),

  logout: (refreshToken) =>
    apiClient
      .post('/auth/logout', refreshToken ? { refreshToken } : {}, { skipAuth: true })
      .then(unwrap),

  me: () => apiClient.get('/auth/me').then(unwrap),

  forgotPassword: (email) =>
    apiClient.post('/auth/forgot-password', { email }, { skipAuth: true }).then(unwrap),
});
