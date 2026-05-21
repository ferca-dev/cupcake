import { defineStore } from 'pinia';

import { transactionService } from '../services/transaction.service.js';

const DEFAULT_PAGINATION = Object.freeze({
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 1,
});

/**
 * Pinia store backing the billing transaction history view. The list endpoint
 * is tenant-scoped on the backend; this store mirrors that behaviour by
 * resetting state on logout/tenant switch (handled by callers via `reset`).
 */
export const useTransactionsStore = defineStore('transactions', {
  state: () => ({
    items: [],
    pagination: { ...DEFAULT_PAGINATION },
    selected: null,
    isLoading: false,
    isLoadingDetail: false,
    lastError: null,
    filters: {
      status: '',
      type: '',
    },
  }),

  getters: {
    isEmpty: (state) => !state.isLoading && state.items.length === 0,
    totalCount: (state) => state.pagination?.total ?? state.items.length,
  },

  actions: {
    async fetchTransactions(query = {}) {
      this.isLoading = true;
      this.lastError = null;
      try {
        const merged = {
          page: this.pagination.page,
          limit: this.pagination.limit,
          status: this.filters.status || undefined,
          type: this.filters.type || undefined,
          ...query,
        };
        const data = await transactionService.list(merged);
        this.items = data?.items ?? [];
        this.pagination = {
          page: data?.pagination?.page ?? 1,
          limit: data?.pagination?.limit ?? DEFAULT_PAGINATION.limit,
          total: data?.pagination?.total ?? this.items.length,
          totalPages: data?.pagination?.totalPages ?? 1,
        };
        return this.items;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load transactions';
        throw err;
      } finally {
        this.isLoading = false;
      }
    },

    async fetchTransaction(id) {
      this.isLoadingDetail = true;
      this.lastError = null;
      try {
        const data = await transactionService.get(id);
        this.selected = data?.transaction ?? null;
        return this.selected;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load transaction';
        throw err;
      } finally {
        this.isLoadingDetail = false;
      }
    },

    setFilter(key, value) {
      if (!(key in this.filters)) return;
      this.filters = { ...this.filters, [key]: value ?? '' };
      this.pagination = { ...this.pagination, page: 1 };
    },

    setPage(page) {
      this.pagination = { ...this.pagination, page };
    },

    reset() {
      this.items = [];
      this.pagination = { ...DEFAULT_PAGINATION };
      this.selected = null;
      this.lastError = null;
      this.filters = { status: '', type: '' };
    },
  },
});
