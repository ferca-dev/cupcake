import { apiClient } from './apiClient.js';

const unwrap = (response) => response?.data ?? null;

const buildQuery = (filters = {}) => {
  const query = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined || value === '') continue;
    query[key] = value;
  }
  return query;
};

export const surveyorActivityService = Object.freeze({
  summary: (filters = {}) =>
    apiClient.get('/surveyor-activity/summary', { query: buildQuery(filters) }).then(unwrap),

  responses: (filters = {}) =>
    apiClient.get('/surveyor-activity/responses', { query: buildQuery(filters) }).then(unwrap),

  map: (filters = {}) =>
    apiClient.get('/surveyor-activity/map', { query: buildQuery(filters) }).then(unwrap),

  export: (filters = {}) =>
    apiClient.download('/surveyor-activity/export', { query: buildQuery(filters) }),
});
