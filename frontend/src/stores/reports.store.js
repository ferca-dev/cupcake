import { defineStore } from 'pinia';

import { reportService } from '../services/report.service.js';

const emptyFilters = () => ({
  from: null,
  to: null,
  channel: null,
  campaignId: null,
  surveyVersionId: null,
  completionStatus: 'all',
});

const cleanFilters = (filters) => {
  const out = {};
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value === null || value === undefined || value === '') continue;
    out[key] = value;
  }
  return out;
};

/**
 * Pinia store powering the per-survey report views. Reports are loaded
 * independently so each tab/card can refresh without re-running every
 * aggregation. `filters` is the single source of truth for the active query
 * filters and is reused across every report request.
 */
export const useReportsStore = defineStore('reports', {
  state: () => ({
    surveyId: null,
    filters: emptyFilters(),
    overview: null,
    channels: null,
    questions: null,
    trends: null,
    dropOff: null,
    timing: null,
    versions: null,
    loading: {
      overview: false,
      channels: false,
      questions: false,
      trends: false,
      dropOff: false,
      timing: false,
      versions: false,
    },
    errors: {
      overview: null,
      channels: null,
      questions: null,
      trends: null,
      dropOff: null,
      timing: null,
      versions: null,
    },
  }),

  getters: {
    activeFilters: (state) => cleanFilters(state.filters),
    hasAnyData: (state) =>
      Boolean(state.overview || state.channels || state.questions || state.trends || state.timing),
  },

  actions: {
    setSurvey(surveyId) {
      if (this.surveyId !== surveyId) {
        this.reset();
        this.surveyId = surveyId;
      }
    },

    setFilters(partial = {}) {
      this.filters = { ...this.filters, ...partial };
    },

    resetFilters() {
      this.filters = emptyFilters();
    },

    async _runReport(key, fetcher) {
      this.loading[key] = true;
      this.errors[key] = null;
      try {
        const data = await fetcher();
        this[key] = data?.report ?? null;
        return this[key];
      } catch (err) {
        this.errors[key] = err?.message ?? 'Unable to load report';
        throw err;
      } finally {
        this.loading[key] = false;
      }
    },

    async fetchOverview() {
      return this._runReport('overview', () =>
        reportService.overview(this.surveyId, this.activeFilters),
      );
    },
    async fetchChannels() {
      return this._runReport('channels', () =>
        reportService.channels(this.surveyId, this.activeFilters),
      );
    },
    async fetchQuestions() {
      return this._runReport('questions', () =>
        reportService.questions(this.surveyId, this.activeFilters),
      );
    },
    async fetchTrends() {
      return this._runReport('trends', () =>
        reportService.trends(this.surveyId, this.activeFilters),
      );
    },
    async fetchDropOff() {
      return this._runReport('dropOff', () =>
        reportService.dropOff(this.surveyId, this.activeFilters),
      );
    },
    async fetchTiming() {
      return this._runReport('timing', () =>
        reportService.timing(this.surveyId, this.activeFilters),
      );
    },
    async fetchVersions() {
      return this._runReport('versions', () =>
        reportService.versions(this.surveyId, this.activeFilters),
      );
    },

    async fetchAll() {
      await Promise.all([
        this.fetchOverview().catch(() => null),
        this.fetchChannels().catch(() => null),
        this.fetchQuestions().catch(() => null),
        this.fetchTrends().catch(() => null),
        this.fetchDropOff().catch(() => null),
        this.fetchTiming().catch(() => null),
        this.fetchVersions().catch(() => null),
      ]);
    },

    exportUrl(options = {}) {
      if (!this.surveyId) return null;
      return reportService.exportUrl(this.surveyId, {
        ...this.activeFilters,
        ...options,
      });
    },

    reset() {
      this.surveyId = null;
      this.filters = emptyFilters();
      this.overview = null;
      this.channels = null;
      this.questions = null;
      this.trends = null;
      this.dropOff = null;
      this.timing = null;
      this.versions = null;
      for (const key of Object.keys(this.loading)) this.loading[key] = false;
      for (const key of Object.keys(this.errors)) this.errors[key] = null;
    },
  },
});
