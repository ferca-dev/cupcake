import { apiClient } from './apiClient.js';

// Mercado Pago billing endpoints. Tenant scoping is implicit from the bearer
// token; super admins can impersonate via `x-impersonate-tenant`.

const unwrap = (response) => response?.data ?? null;

export const billingPaymentsService = Object.freeze({
  createPreference: (payload) =>
    apiClient.post('/billing/mercadopago/preferences', payload).then(unwrap),
  listPayments: (query) => apiClient.get('/billing/payments', { query }).then(unwrap),
  getPayment: (id) => apiClient.get(`/billing/payments/${id}`).then(unwrap),

  listSubscriptionPlans: () => apiClient.get('/billing/subscription-plans').then(unwrap),
  listSubscriptions: (query) => apiClient.get('/billing/subscriptions', { query }).then(unwrap),
  createSubscription: (payload) => apiClient.post('/billing/subscriptions', payload).then(unwrap),
  cancelSubscription: (id) =>
    apiClient.post(`/billing/subscriptions/${id}/cancel`, {}).then(unwrap),
  pauseSubscription: (id) => apiClient.post(`/billing/subscriptions/${id}/pause`, {}).then(unwrap),
  resumeSubscription: (id) =>
    apiClient.post(`/billing/subscriptions/${id}/resume`, {}).then(unwrap),

  listInvoices: (query) => apiClient.get('/billing/subscription-invoices', { query }).then(unwrap),
});

export const adminPaymentsService = Object.freeze({
  listPayments: (query) => apiClient.get('/admin/payments', { query }).then(unwrap),
  getPayment: (id) => apiClient.get(`/admin/payments/${id}`).then(unwrap),
  listWebhookEvents: (query) => apiClient.get('/admin/payment-webhooks', { query }).then(unwrap),
  reconcile: (paymentId) => apiClient.post('/admin/payments/reconcile', { paymentId }).then(unwrap),

  listPlans: (query) => apiClient.get('/admin/subscription-plans', { query }).then(unwrap),
  createPlan: (payload) => apiClient.post('/admin/subscription-plans', payload).then(unwrap),
  updatePlan: (id, payload) =>
    apiClient.put(`/admin/subscription-plans/${id}`, payload).then(unwrap),
  updatePlanStatus: (id, status) =>
    apiClient.patch(`/admin/subscription-plans/${id}/status`, { status }).then(unwrap),

  listSubscriptions: (query) => apiClient.get('/admin/subscriptions', { query }).then(unwrap),
  syncSubscription: (id) => apiClient.post(`/admin/subscriptions/${id}/sync`, {}).then(unwrap),
  cancelSubscription: (id) => apiClient.post(`/admin/subscriptions/${id}/cancel`, {}).then(unwrap),
  pauseSubscription: (id) => apiClient.post(`/admin/subscriptions/${id}/pause`, {}).then(unwrap),
});
