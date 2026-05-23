import { apiClient } from './apiClient.js';

// Super-admin facing token configuration endpoints. The backend enforces the
// super-admin role, so the service surface intentionally stays flat.

const unwrap = (response) => response?.data ?? null;

export const adminTokensService = Object.freeze({
  listPackages: (query) => apiClient.get('/admin/token-packages', { query }).then(unwrap),
  createPackage: (payload) => apiClient.post('/admin/token-packages', payload).then(unwrap),
  updatePackage: (id, payload) =>
    apiClient.put(`/admin/token-packages/${id}`, payload).then(unwrap),
  updatePackageStatus: (id, payload) =>
    apiClient.patch(`/admin/token-packages/${id}/status`, payload).then(unwrap),

  listChannelPricing: () => apiClient.get('/admin/channel-pricing').then(unwrap),
  updateChannelPricing: (payload) => apiClient.put('/admin/channel-pricing', payload).then(unwrap),

  getTenantWallet: (tenantId) =>
    apiClient.get(`/admin/tenants/${tenantId}/token-wallet`).then(unwrap),
  getTenantSendLimits: (tenantId) =>
    apiClient.get(`/admin/tenants/${tenantId}/send-limits`).then(unwrap),
  updateTenantSendLimits: (tenantId, payload) =>
    apiClient.put(`/admin/tenants/${tenantId}/send-limits`, payload).then(unwrap),
  adjustTenantWallet: (tenantId, payload) =>
    apiClient.post(`/admin/tenants/${tenantId}/token-adjustments`, payload).then(unwrap),

  listPurchases: (query) => apiClient.get('/admin/token-purchases', { query }).then(unwrap),
  approvePurchase: (id, payload = {}) =>
    apiClient.post(`/admin/token-purchases/${id}/approve`, payload).then(unwrap),
  rejectPurchase: (id, payload = {}) =>
    apiClient.post(`/admin/token-purchases/${id}/reject`, payload).then(unwrap),
});
