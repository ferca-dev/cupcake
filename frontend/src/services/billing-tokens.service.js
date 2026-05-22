import { apiClient } from './apiClient.js';

// Tenant-facing token billing endpoints. All calls require `billing.view`
// permission on the backend; tenant scoping is implicit from the bearer
// token. Super admins may impersonate via `x-impersonate-tenant` but the
// surface is the same as for client users.

const unwrap = (response) => response?.data ?? null;

export const billingTokensService = Object.freeze({
  getBalance: () => apiClient.get('/billing/tokens/balance').then(unwrap),
  listLedger: (query) => apiClient.get('/billing/tokens/ledger', { query }).then(unwrap),
  listPackages: () => apiClient.get('/billing/token-packages').then(unwrap),
  listPurchases: (query) => apiClient.get('/billing/token-purchases', { query }).then(unwrap),
  requestPurchase: (payload) => apiClient.post('/billing/token-purchases', payload).then(unwrap),
});
