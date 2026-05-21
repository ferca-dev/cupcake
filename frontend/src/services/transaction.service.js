import { apiClient } from './apiClient.js';

const unwrap = (response) => response?.data ?? null;

export const transactionService = Object.freeze({
  list: (query) => apiClient.get('/transactions', { query }).then(unwrap),

  get: (id) => apiClient.get(`/transactions/${id}`).then(unwrap),
});
