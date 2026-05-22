import { apiClient } from './apiClient.js';

// Thin wrapper around the backend `/api/v1/settings/*` endpoints. Each call
// returns the unwrapped `data` envelope; errors propagate as `ApiError`
// instances so views can branch on `err.code` / `err.status` directly.

const unwrap = (response) => response?.data ?? null;

export const settingsService = Object.freeze({
  getProfile: () => apiClient.get('/settings/profile').then(unwrap),
  updateProfile: (payload) => apiClient.put('/settings/profile', payload).then(unwrap),
  updatePassword: (payload) => apiClient.put('/settings/password', payload).then(unwrap),
  updatePreferences: (payload) => apiClient.put('/settings/preferences', payload).then(unwrap),
});
