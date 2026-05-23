import { defineStore } from 'pinia';

import { billingPlansService } from '../services/billing-plans.service.js';

/**
 * Holds the tenant's currently-active plan, usage rows, available upgrades,
 * and feature/quota catalogue. The store doubles as a feature-gate helper:
 * components can call `hasFeature(key)` to drive UI gating without
 * re-fetching the plan endpoint per check.
 */
export const useBillingPlansStore = defineStore('billingPlans', {
  state: () => ({
    plan: null,
    assignment: null,
    quotas: [],
    availablePlans: [],
    catalogue: null,
    isLoadingPlan: false,
    isLoadingUsage: false,
    isLoadingAvailable: false,
    lastError: null,
    lastLoadedAt: null,
  }),

  getters: {
    /**
     * Returns the active feature map keyed by feature key. Useful for direct
     * lookups in templates: `store.features['campaigns.sms']`.
     */
    features: (state) => state.plan?.features ?? {},

    quotaByKey: (state) => {
      const map = {};
      for (const row of state.quotas) map[row.key] = row;
      return map;
    },

    /**
     * Quotas at or over 80% are considered "near the limit". The summary row
     * is what drives the dashboard warning banner.
     */
    warningQuotas: (state) => state.quotas.filter((q) => q.warning),

    exhaustedQuotas: (state) => state.quotas.filter((q) => q.exhausted),

    planLabel: (state) =>
      state.plan?.name ?? (state.plan?.code ? state.plan.code : 'Unmanaged'),
  },

  actions: {
    hasFeature(key) {
      return Boolean(this.plan?.features?.[key]);
    },

    quotaRow(key) {
      return this.quotas.find((q) => q.key === key) ?? null;
    },

    async fetchPlan() {
      this.isLoadingPlan = true;
      this.lastError = null;
      try {
        const data = await billingPlansService.getMyPlan();
        this.plan = data?.plan ?? null;
        this.assignment = data?.assignment ?? null;
        this.lastLoadedAt = new Date();
        return this.plan;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load plan';
        throw err;
      } finally {
        this.isLoadingPlan = false;
      }
    },

    async fetchUsage() {
      this.isLoadingUsage = true;
      this.lastError = null;
      try {
        const data = await billingPlansService.getMyUsage();
        this.plan = data?.plan ?? this.plan;
        this.assignment = data?.assignment ?? this.assignment;
        this.quotas = data?.quotas ?? [];
        this.lastLoadedAt = new Date();
        return this.quotas;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load usage';
        throw err;
      } finally {
        this.isLoadingUsage = false;
      }
    },

    async fetchAvailablePlans() {
      this.isLoadingAvailable = true;
      this.lastError = null;
      try {
        const data = await billingPlansService.listAvailablePlans();
        this.availablePlans = data?.items ?? [];
        return this.availablePlans;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load available plans';
        throw err;
      } finally {
        this.isLoadingAvailable = false;
      }
    },

    async fetchCatalogue(force = false) {
      if (this.catalogue && !force) return this.catalogue;
      try {
        const data = await billingPlansService.getCatalogue();
        this.catalogue = data ?? null;
        return this.catalogue;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load catalogue';
        throw err;
      }
    },

    reset() {
      this.plan = null;
      this.assignment = null;
      this.quotas = [];
      this.availablePlans = [];
      this.lastError = null;
      this.lastLoadedAt = null;
    },
  },
});
