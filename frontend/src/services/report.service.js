import { API_BASE_URL } from '../config/env.js';
import { apiClient } from './apiClient.js';

const unwrap = (response) => response?.data ?? null;

const buildQuery = (filters = {}) => {
  const out = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined || value === '') continue;
    out[key] = value;
  }
  return out;
};

export const reportService = Object.freeze({
  overview: (surveyId, filters = {}) =>
    apiClient
      .get(`/surveys/${surveyId}/reports/overview`, { query: buildQuery(filters) })
      .then(unwrap),

  channels: (surveyId, filters = {}) =>
    apiClient
      .get(`/surveys/${surveyId}/reports/channels`, { query: buildQuery(filters) })
      .then(unwrap),

  questions: (surveyId, filters = {}) =>
    apiClient
      .get(`/surveys/${surveyId}/reports/questions`, { query: buildQuery(filters) })
      .then(unwrap),

  trends: (surveyId, filters = {}) =>
    apiClient
      .get(`/surveys/${surveyId}/reports/trends`, { query: buildQuery(filters) })
      .then(unwrap),

  dropOff: (surveyId, filters = {}) =>
    apiClient
      .get(`/surveys/${surveyId}/reports/drop-off`, { query: buildQuery(filters) })
      .then(unwrap),

  timing: (surveyId, filters = {}) =>
    apiClient
      .get(`/surveys/${surveyId}/reports/timing`, { query: buildQuery(filters) })
      .then(unwrap),

  versions: (surveyId, filters = {}) =>
    apiClient
      .get(`/surveys/${surveyId}/reports/versions`, { query: buildQuery(filters) })
      .then(unwrap),

  /**
   * Builds the absolute URL for the export endpoint. The frontend lets the
   * browser handle the download (so the file is saved natively rather than
   * loaded into memory) — this helper just assembles the URL.
   */
  exportUrl: (surveyId, { format = 'csv', type = 'responses', ...filters } = {}) => {
    const params = new URLSearchParams();
    params.set('format', format);
    params.set('type', type);
    for (const [key, value] of Object.entries(filters)) {
      if (value === null || value === undefined || value === '') continue;
      params.set(key, value);
    }
    return `${API_BASE_URL}/surveys/${surveyId}/reports/export?${params.toString()}`;
  },
});
