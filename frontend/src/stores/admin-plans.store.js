import { defineStore } from 'pinia';

import { adminPlansService } from '../services/admin-plans.service.js';

/**
 * Holds the super-admin plan catalogue, the in-flight catalogue (feature and
 * quota definitions), the plan being edited, and the per-tenant assignment
 * data shown on the tenant detail panel.
 *
 * Tenant data stays here rather than in the generic admin store so the
 * "tenant detail" page can mix plan, usage, and history in a single
 * coordinated load.
 */
export const useAdminPlansStore = defineStore('adminPlans', {
  state: () => ({
    plans: [],
    pagination: null,
    catalogue: null,
    isLoadingPlans: false,

    selectedPlan: null,
    isLoadingDetail: false,

    tenantPlan: null,
    tenantUsage: null,
    tenantHistory: [],
    isLoadingTenant: false,

    isMutating: false,
    lastError: null,
  }),

  getters: {
    activePlans: (state) => state.plans.filter((p) => p.status === 'active'),
    archivedPlans: (state) => state.plans.filter((p) => p.status === 'archived'),
    featureDefinitions: (state) => state.catalogue?.features ?? [],
    quotaDefinitions: (state) => state.catalogue?.quotas ?? [],
  },

  actions: {
    async fetchCatalogue(force = false) {
      if (this.catalogue && !force) return this.catalogue;
      try {
        const data = await adminPlansService.getCatalogue();
        this.catalogue = data ?? null;
        return this.catalogue;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load plan catalogue';
        throw err;
      }
    },

    async fetchPlans(query = {}) {
      this.isLoadingPlans = true;
      this.lastError = null;
      try {
        const data = await adminPlansService.listPlans({ limit: 50, ...query });
        this.plans = data?.items ?? [];
        this.pagination = data?.pagination ?? null;
        return this.plans;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load plans';
        throw err;
      } finally {
        this.isLoadingPlans = false;
      }
    },

    async fetchPlan(id) {
      this.isLoadingDetail = true;
      this.lastError = null;
      try {
        const data = await adminPlansService.getPlan(id);
        this.selectedPlan = data?.plan ?? null;
        return this.selectedPlan;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load plan';
        throw err;
      } finally {
        this.isLoadingDetail = false;
      }
    },

    async createPlan(payload) {
      this.isMutating = true;
      this.lastError = null;
      try {
        const data = await adminPlansService.createPlan(payload);
        const created = data?.plan ?? null;
        if (created) this.plans = [created, ...this.plans];
        return created;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to create plan';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async updatePlan(id, payload) {
      this.isMutating = true;
      this.lastError = null;
      try {
        const data = await adminPlansService.updatePlan(id, payload);
        const updated = data?.plan ?? null;
        if (updated) {
          this.plans = this.plans.map((p) => (p.id === id ? updated : p));
          if (this.selectedPlan?.id === id) this.selectedPlan = updated;
        }
        return updated;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to update plan';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async updatePlanStatus(id, status) {
      this.isMutating = true;
      this.lastError = null;
      try {
        const data = await adminPlansService.updatePlanStatus(id, { status });
        const updated = data?.plan ?? null;
        if (updated) {
          this.plans = this.plans.map((p) => (p.id === id ? updated : p));
          if (this.selectedPlan?.id === id) this.selectedPlan = updated;
        }
        return updated;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to update plan status';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async fetchTenantPlan(tenantId) {
      this.isLoadingTenant = true;
      this.lastError = null;
      try {
        const [plan, usage, history] = await Promise.all([
          adminPlansService.getTenantPlan(tenantId),
          adminPlansService.getTenantUsage(tenantId),
          adminPlansService.listTenantPlanHistory(tenantId, { limit: 25 }),
        ]);
        this.tenantPlan = plan ?? null;
        this.tenantUsage = usage ?? null;
        this.tenantHistory = history?.items ?? [];
        return { plan, usage, history };
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load tenant plan';
        throw err;
      } finally {
        this.isLoadingTenant = false;
      }
    },

    async assignTenantPlan(tenantId, payload) {
      this.isMutating = true;
      this.lastError = null;
      try {
        const data = await adminPlansService.assignTenantPlan(tenantId, payload);
        // Re-fetch so the displayed quotas + history reflect the new state.
        await this.fetchTenantPlan(tenantId);
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to assign plan';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    reset() {
      this.plans = [];
      this.pagination = null;
      this.selectedPlan = null;
      this.tenantPlan = null;
      this.tenantUsage = null;
      this.tenantHistory = [];
      this.lastError = null;
    },
  },
});
