import { defineStore } from 'pinia';

import { dashboardService } from '../services/dashboard.service.js';

export const useDashboardStore = defineStore('dashboard', {
  state: () => ({
    scope: null,
    summary: null,
    channels: null,
    recentActivity: [],
    adminMetrics: null,
    surveyStats: null,
    isLoadingSummary: false,
    isLoadingChannels: false,
    isLoadingActivity: false,
    isLoadingAdmin: false,
    isLoadingSurveyStats: false,
    lastError: null,
  }),

  getters: {
    isClientScope: (state) => state.scope === 'tenant',
    isGlobalScope: (state) => state.scope === 'global',
  },

  actions: {
    async fetchSummary() {
      this.isLoadingSummary = true;
      this.lastError = null;
      try {
        const data = await dashboardService.summary();
        this.scope = data?.scope ?? null;
        this.summary = data?.summary ?? null;
        return this.summary;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load dashboard summary';
        throw err;
      } finally {
        this.isLoadingSummary = false;
      }
    },

    async fetchChannels() {
      this.isLoadingChannels = true;
      try {
        const data = await dashboardService.channels();
        this.channels = data ?? null;
        return this.channels;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load channel metrics';
        throw err;
      } finally {
        this.isLoadingChannels = false;
      }
    },

    async fetchRecentActivity(query = { limit: 20 }) {
      this.isLoadingActivity = true;
      try {
        const data = await dashboardService.recentActivity(query);
        this.recentActivity = data?.items ?? [];
        return this.recentActivity;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load recent activity';
        throw err;
      } finally {
        this.isLoadingActivity = false;
      }
    },

    async fetchAdminMetrics(query = { limit: 10 }) {
      this.isLoadingAdmin = true;
      try {
        const data = await dashboardService.adminMetrics(query);
        this.adminMetrics = data?.metrics ?? null;
        return this.adminMetrics;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load admin metrics';
        throw err;
      } finally {
        this.isLoadingAdmin = false;
      }
    },

    async fetchSurveyStats(id) {
      this.isLoadingSurveyStats = true;
      try {
        const data = await dashboardService.surveyStats(id);
        this.surveyStats = data?.stats ?? null;
        return this.surveyStats;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load survey stats';
        throw err;
      } finally {
        this.isLoadingSurveyStats = false;
      }
    },

    reset() {
      this.scope = null;
      this.summary = null;
      this.channels = null;
      this.recentActivity = [];
      this.adminMetrics = null;
      this.surveyStats = null;
      this.lastError = null;
    },
  },
});
