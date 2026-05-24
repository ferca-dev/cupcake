import { apiClient } from './apiClient.js';

const unwrap = (response) => response?.data ?? null;

export const surveyorService = Object.freeze({
  listSurveys: (query) => apiClient.get('/surveyor/surveys', { query }).then(unwrap),

  getSurvey: (id) => apiClient.get(`/surveyor/surveys/${id}`).then(unwrap),

  submitResponse: (id, payload) =>
    apiClient.post(`/surveyor/surveys/${id}/responses`, payload).then(unwrap),
});
