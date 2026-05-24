import { apiClient } from './apiClient.js';

// Wrapper around the backend `/developer/*` endpoints used by the workspace
// API keys and outbound webhooks page. The unwrap helper drops the success
// envelope so views can bind to the data directly.

const unwrap = (response) => response?.data ?? null;

export const developerService = Object.freeze({
  // API keys -----------------------------------------------------------
  listApiKeys: () => apiClient.get('/developer/api-keys').then(unwrap),

  createApiKey: (payload) => apiClient.post('/developer/api-keys', payload).then(unwrap),

  rotateApiKey: (id) =>
    apiClient.post(`/developer/api-keys/${id}/rotate`, {}).then(unwrap),

  revokeApiKey: (id) =>
    apiClient.post(`/developer/api-keys/${id}/revoke`, {}).then(unwrap),

  deleteApiKey: (id) => apiClient.delete(`/developer/api-keys/${id}`).then(unwrap),

  // Outbound webhooks --------------------------------------------------
  listWebhooks: () => apiClient.get('/developer/webhooks').then(unwrap),

  createWebhook: (payload) => apiClient.post('/developer/webhooks', payload).then(unwrap),

  updateWebhook: (id, payload) =>
    apiClient.put(`/developer/webhooks/${id}`, payload).then(unwrap),

  deleteWebhook: (id) => apiClient.delete(`/developer/webhooks/${id}`).then(unwrap),

  listDeliveries: (id, query) =>
    apiClient.get(`/developer/webhooks/${id}/deliveries`, { query }).then(unwrap),

  sendTestEvent: (id, payload = {}) =>
    apiClient.post(`/developer/webhooks/${id}/test`, payload).then(unwrap),
});
