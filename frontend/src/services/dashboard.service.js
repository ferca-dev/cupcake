import { apiClient } from './apiClient.js';

const unwrap = (response) => response?.data ?? null;

export const dashboardService = Object.freeze({
  summary: () => apiClient.get('/dashboard/summary').then(unwrap),

  surveyStats: (id) => apiClient.get(`/dashboard/surveys/${id}`).then(unwrap),

  channels: () => apiClient.get('/dashboard/channels').then(unwrap),

  recentActivity: (query = {}) =>
    apiClient.get('/dashboard/recent-activity', { query }).then(unwrap),

  adminMetrics: (query = {}) => apiClient.get('/admin/metrics', { query }).then(unwrap),
});
