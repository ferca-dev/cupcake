import { apiClient } from './apiClient.js';

// Tenant-facing endpoints for the active plan and usage meters.
const unwrap = (response) => response?.data ?? null;

export const billingPlansService = Object.freeze({
  getMyPlan: () => apiClient.get('/billing/plan').then(unwrap),
  getMyUsage: () => apiClient.get('/billing/usage').then(unwrap),
  listAvailablePlans: () => apiClient.get('/billing/plans/available').then(unwrap),
  getCatalogue: () => apiClient.get('/billing/plans/catalogue').then(unwrap),
});
