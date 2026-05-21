import { defineStore } from 'pinia';

import { adminService } from '../services/admin.service.js';

const DEFAULT_LIST_QUERY = Object.freeze({ page: 1, limit: 25, sort: '-createdAt' });

/**
 * Owns the data fetched by the super admin panel: the tenant list, the
 * tenant currently being inspected (with its users), and the global metrics
 * powering the admin overview. The backend enforces super-admin access; the
 * store just keeps the UI honest about loading/error state.
 */
export const useAdminStore = defineStore('admin', {
  state: () => ({
    tenants: [],
    pagination: null,
    listQuery: { ...DEFAULT_LIST_QUERY },
    selectedTenant: null,
    selectedUsers: [],
    metrics: null,
    isLoadingList: false,
    isLoadingDetail: false,
    isLoadingMetrics: false,
    isMutating: false,
    lastError: null,
  }),

  getters: {
    totalTenants: (state) => state.pagination?.total ?? state.tenants.length,
    activeTenants: (state) => state.tenants.filter((tenant) => tenant.status === 'active').length,
    suspendedTenants: (state) =>
      state.tenants.filter((tenant) => tenant.status === 'suspended').length,
    cancelledTenants: (state) =>
      state.tenants.filter((tenant) => tenant.status === 'cancelled').length,
  },

  actions: {
    setListQuery(patch = {}) {
      this.listQuery = { ...this.listQuery, ...patch };
    },

    resetListQuery() {
      this.listQuery = { ...DEFAULT_LIST_QUERY };
    },

    async fetchTenants(query) {
      this.isLoadingList = true;
      this.lastError = null;
      if (query) this.setListQuery(query);
      try {
        const data = await adminService.listTenants(this.listQuery);
        this.tenants = data?.items ?? [];
        this.pagination = data?.pagination ?? null;
        return this.tenants;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load tenants';
        throw err;
      } finally {
        this.isLoadingList = false;
      }
    },

    async fetchTenant(id) {
      this.isLoadingDetail = true;
      this.lastError = null;
      try {
        const data = await adminService.getTenant(id);
        this.selectedTenant = data?.tenant ?? null;
        return this.selectedTenant;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load tenant';
        throw err;
      } finally {
        this.isLoadingDetail = false;
      }
    },

    async fetchTenantUsers(id) {
      this.lastError = null;
      try {
        const data = await adminService.listTenantUsers(id);
        this.selectedUsers = data?.items ?? [];
        return this.selectedUsers;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load tenant users';
        throw err;
      }
    },

    async createTenant(payload) {
      this.isMutating = true;
      this.lastError = null;
      try {
        const data = await adminService.createTenant(payload);
        const created = data?.tenant ?? null;
        if (created) {
          this.tenants = [created, ...this.tenants];
          if (this.pagination) {
            this.pagination = { ...this.pagination, total: (this.pagination.total ?? 0) + 1 };
          }
        }
        return created;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to create tenant';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async updateTenant(id, payload) {
      this.isMutating = true;
      this.lastError = null;
      try {
        const data = await adminService.updateTenant(id, payload);
        const updated = data?.tenant ?? null;
        if (updated) this.applyTenantPatch(updated);
        return updated;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to update tenant';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async updateTenantStatus(id, payload) {
      this.isMutating = true;
      this.lastError = null;
      try {
        const data = await adminService.updateTenantStatus(id, payload);
        const updated = data?.tenant ?? null;
        if (updated) this.applyTenantPatch(updated);
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to update tenant status';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async fetchMetrics(query = { limit: 10 }) {
      this.isLoadingMetrics = true;
      this.lastError = null;
      try {
        const data = await adminService.metrics(query);
        this.metrics = data?.metrics ?? null;
        return this.metrics;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load admin metrics';
        throw err;
      } finally {
        this.isLoadingMetrics = false;
      }
    },

    /**
     * Replaces the matching tenant in both the list and the detail slot so
     * that a status change in the detail view stays consistent with the list.
     */
    applyTenantPatch(updated) {
      this.tenants = this.tenants.map((tenant) =>
        tenant.id === updated.id ? { ...tenant, ...updated } : tenant,
      );
      if (this.selectedTenant?.id === updated.id) {
        this.selectedTenant = { ...this.selectedTenant, ...updated };
      }
    },

    reset() {
      this.tenants = [];
      this.pagination = null;
      this.selectedTenant = null;
      this.selectedUsers = [];
      this.metrics = null;
      this.lastError = null;
      this.resetListQuery();
    },
  },
});
