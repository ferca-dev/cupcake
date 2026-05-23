import { apiClient } from './apiClient.js';

const unwrap = (response) => response?.data ?? null;

export const suppressionService = Object.freeze({
  list: (query) => apiClient.get('/suppression-list', { query }).then(unwrap),

  create: (payload) => apiClient.post('/suppression-list', payload).then(unwrap),

  remove: (id) => apiClient.delete(`/suppression-list/${id}`).then(unwrap),
});

export const publicUnsubscribeService = Object.freeze({
  previewEmail: (token) =>
    apiClient
      .get(`/public/unsubscribe/email/${encodeURIComponent(token)}`, { skipAuth: true })
      .then(unwrap),

  confirmEmail: (token) =>
    apiClient.post('/public/unsubscribe/email', { token }, { skipAuth: true }).then(unwrap),
});
