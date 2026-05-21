import { apiClient } from './apiClient.js';

const unwrap = (response) => response?.data ?? null;

export const campaignService = Object.freeze({
  list: (query) => apiClient.get('/campaigns', { query }).then(unwrap),

  get: (id) => apiClient.get(`/campaigns/${id}`).then(unwrap),

  create: (payload) => apiClient.post('/campaigns', payload).then(unwrap),

  send: (id) => apiClient.post(`/campaigns/${id}/send`).then(unwrap),

  listRecipients: (id, query) =>
    apiClient.get(`/campaigns/${id}/recipients`, { query }).then(unwrap),

  getReport: (id) => apiClient.get(`/campaigns/${id}/report`).then(unwrap),
});
