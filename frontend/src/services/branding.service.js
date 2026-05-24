import { apiClient } from './apiClient.js';

const unwrap = (response) => response?.data ?? null;

export const brandingService = Object.freeze({
  get: () => apiClient.get('/branding').then(unwrap),
  update: (payload) => apiClient.put('/branding', payload).then(unwrap),
});
