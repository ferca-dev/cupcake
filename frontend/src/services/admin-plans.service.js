import { apiClient } from './apiClient.js';

// Admin endpoints for product packaging plans. Backend enforces super-admin
// access; the service surface is intentionally flat so the store can chain
// list → mutate without per-method authorization concerns.

const unwrap = (response) => response?.data ?? null;

export const adminPlansService = Object.freeze({
  listPlans: (query) => apiClient.get('/admin/plans', { query }).then(unwrap),
  getPlan: (id) => apiClient.get(`/admin/plans/${id}`).then(unwrap),
  createPlan: (payload) => apiClient.post('/admin/plans', payload).then(unwrap),
  updatePlan: (id, payload) => apiClient.put(`/admin/plans/${id}`, payload).then(unwrap),
  updatePlanStatus: (id, payload) =>
    apiClient.patch(`/admin/plans/${id}/status`, payload).then(unwrap),
  getCatalogue: () => apiClient.get('/admin/plans/catalogue').then(unwrap),
  assignTenantPlan: (tenantId, payload) =>
    apiClient.post(`/admin/tenants/${tenantId}/plan`, payload).then(unwrap),
  getTenantPlan: (tenantId) => apiClient.get(`/admin/tenants/${tenantId}/plan`).then(unwrap),
  listTenantPlanHistory: (tenantId, query) =>
    apiClient.get(`/admin/tenants/${tenantId}/plan-history`, { query }).then(unwrap),
  getTenantUsage: (tenantId) => apiClient.get(`/admin/tenants/${tenantId}/usage`).then(unwrap),
});
