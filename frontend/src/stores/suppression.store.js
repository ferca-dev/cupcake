import { defineStore } from 'pinia';

import { suppressionService } from '../services/suppression.service.js';

const DEFAULT_FILTERS = Object.freeze({
  search: '',
  channel: '',
  status: 'active',
  reason: '',
  source: '',
  sort: '-createdAt',
});

const DEFAULT_PAGINATION = Object.freeze({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 1,
});

const cleanQuery = (filters, pagination) => {
  const query = {
    page: pagination.page,
    limit: pagination.limit,
    sort: filters.sort,
  };
  for (const key of ['search', 'channel', 'status', 'reason', 'source']) {
    if (filters[key]) query[key] = filters[key];
  }
  return query;
};

export const useSuppressionStore = defineStore('suppression', {
  state: () => ({
    entries: [],
    filters: { ...DEFAULT_FILTERS },
    pagination: { ...DEFAULT_PAGINATION },
    isLoading: false,
    isSaving: false,
    lastError: null,
  }),

  actions: {
    setFilters(partial) {
      this.filters = { ...this.filters, ...partial };
      this.pagination = { ...this.pagination, page: 1 };
    },

    async fetchEntries() {
      this.isLoading = true;
      this.lastError = null;
      try {
        const data = await suppressionService.list(cleanQuery(this.filters, this.pagination));
        this.entries = data?.items ?? [];
        this.pagination = {
          page: data?.pagination?.page ?? this.pagination.page,
          limit: data?.pagination?.limit ?? this.pagination.limit,
          total: data?.pagination?.total ?? this.entries.length,
          totalPages: data?.pagination?.totalPages ?? 1,
        };
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load suppression entries';
        throw err;
      } finally {
        this.isLoading = false;
      }
    },

    async createEntry(payload) {
      this.isSaving = true;
      this.lastError = null;
      try {
        const data = await suppressionService.create(payload);
        await this.fetchEntries();
        return data?.suppression ?? null;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to create suppression entry';
        throw err;
      } finally {
        this.isSaving = false;
      }
    },

    async releaseEntry(id) {
      this.lastError = null;
      const data = await suppressionService.remove(id);
      if (data?.suppression) {
        this.entries = this.entries.map((entry) => (entry.id === id ? data.suppression : entry));
      }
      return data?.suppression ?? null;
    },
  },
});
