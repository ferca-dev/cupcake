import { apiClient } from './apiClient.js';

// Thin wrapper around the backend `/admin/*` endpoints. The backend rejects
// every call from non-super-admin sessions so we keep the service surface
// flat and let the API enforce authorization.

const unwrap = (response) => response?.data ?? null;

export const adminService = Object.freeze({
  metrics: (query) => apiClient.get('/admin/metrics', { query }).then(unwrap),

  listTenants: (query) => apiClient.get('/admin/tenants', { query }).then(unwrap),

  getTenant: (id) => apiClient.get(`/admin/tenants/${id}`).then(unwrap),

  createTenant: (payload) => apiClient.post('/admin/tenants', payload).then(unwrap),

  updateTenant: (id, payload) => apiClient.put(`/admin/tenants/${id}`, payload).then(unwrap),

  updateTenantStatus: (id, payload) =>
    apiClient.patch(`/admin/tenants/${id}/status`, payload).then(unwrap),

  listTenantUsers: (id) => apiClient.get(`/admin/tenants/${id}/users`).then(unwrap),

  listTenantInvitations: (id, query) =>
    apiClient.get(`/admin/tenants/${id}/invitations`, { query }).then(unwrap),
});
