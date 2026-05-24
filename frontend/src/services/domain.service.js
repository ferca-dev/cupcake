import { apiClient } from './apiClient.js';

const unwrap = (response) => response?.data ?? null;

export const domainService = Object.freeze({
  list: (query) => apiClient.get('/domains', { query }).then(unwrap),
  create: (payload) => apiClient.post('/domains', payload).then(unwrap),
  verify: (id) => apiClient.post(`/domains/${id}/verify`).then(unwrap),
  updateStatus: (id, status) => apiClient.patch(`/domains/${id}/status`, { status }).then(unwrap),
  delete: (id) => apiClient.delete(`/domains/${id}`).then(unwrap),
});
