import { apiClient } from './apiClient.js';

// Thin wrapper around the backend `/templates/*` endpoints. Each helper
// unwraps the API success envelope so call sites consume plain objects.
// Errors propagate as `ApiError` instances from the shared client.

const unwrap = (response) => response?.data ?? null;

export const templateService = Object.freeze({
  list: (query) => apiClient.get('/templates', { query }).then(unwrap),

  get: (id) => apiClient.get(`/templates/${id}`).then(unwrap),

  create: (payload) => apiClient.post('/templates', payload).then(unwrap),

  update: (id, payload) => apiClient.put(`/templates/${id}`, payload).then(unwrap),

  remove: (id) => apiClient.delete(`/templates/${id}`).then(unwrap),

  createSurvey: (id, payload) =>
    apiClient.post(`/templates/${id}/create-survey`, payload ?? {}).then(unwrap),
});
