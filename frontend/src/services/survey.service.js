import { apiClient } from './apiClient.js';

// Thin wrapper around the backend `/surveys/*` endpoints. Each helper
// unwraps the API success envelope so call sites consume plain objects.
// Errors propagate as `ApiError` instances from the shared client.

const unwrap = (response) => response?.data ?? null;

export const surveyService = Object.freeze({
  list: (query) => apiClient.get('/surveys', { query }).then(unwrap),

  get: (id) => apiClient.get(`/surveys/${id}`).then(unwrap),

  create: (payload) => apiClient.post('/surveys', payload).then(unwrap),

  update: (id, payload) => apiClient.put(`/surveys/${id}`, payload).then(unwrap),

  remove: (id) => apiClient.delete(`/surveys/${id}`).then(unwrap),

  publish: (id) => apiClient.post(`/surveys/${id}/publish`).then(unwrap),

  pause: (id) => apiClient.post(`/surveys/${id}/pause`).then(unwrap),

  archive: (id) => apiClient.post(`/surveys/${id}/archive`).then(unwrap),

  duplicate: (id, payload) =>
    apiClient.post(`/surveys/${id}/duplicate`, payload ?? {}).then(unwrap),

  listVersions: (id) => apiClient.get(`/surveys/${id}/versions`).then(unwrap),
});
