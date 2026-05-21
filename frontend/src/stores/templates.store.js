import { defineStore } from 'pinia';

import { templateService } from '../services/template.service.js';

/**
 * Pinia store that powers the template browsing and creation flows. The
 * `items` list contains active system templates plus the caller tenant's
 * templates (the API enforces the visibility split — we just render what we
 * receive).
 */
export const useTemplatesStore = defineStore('templates', {
  state: () => ({
    items: [],
    pagination: null,
    isLoading: false,
    isMutating: false,
    lastError: null,
    selected: null,
  }),

  getters: {
    systemTemplates: (state) => state.items.filter((item) => item.isSystemTemplate),
    tenantTemplates: (state) =>
      state.items.filter((item) => !item.isSystemTemplate && item.tenantId !== null),
    byCategory: (state) => {
      const groups = new Map();
      for (const item of state.items) {
        const list = groups.get(item.category) ?? [];
        list.push(item);
        groups.set(item.category, list);
      }
      return groups;
    },
  },

  actions: {
    async fetchTemplates(query = {}) {
      this.isLoading = true;
      this.lastError = null;
      try {
        const data = await templateService.list(query);
        this.items = data?.items ?? [];
        this.pagination = data?.pagination ?? null;
        return this.items;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load templates';
        throw err;
      } finally {
        this.isLoading = false;
      }
    },

    async fetchTemplate(id) {
      this.isLoading = true;
      this.lastError = null;
      try {
        const data = await templateService.get(id);
        this.selected = data?.template ?? null;
        return this.selected;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load template';
        throw err;
      } finally {
        this.isLoading = false;
      }
    },

    async createTemplate(payload) {
      this.isMutating = true;
      this.lastError = null;
      try {
        const data = await templateService.create(payload);
        const created = data?.template ?? null;
        if (created) this.items = [created, ...this.items];
        return created;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to create template';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async updateTemplate(id, payload) {
      this.isMutating = true;
      this.lastError = null;
      try {
        const data = await templateService.update(id, payload);
        const updated = data?.template ?? null;
        if (updated) {
          this.items = this.items.map((item) => (item.id === updated.id ? updated : item));
          if (this.selected?.id === updated.id) this.selected = updated;
        }
        return updated;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to update template';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async deleteTemplate(id) {
      this.isMutating = true;
      this.lastError = null;
      try {
        await templateService.remove(id);
        this.items = this.items.filter((item) => item.id !== id);
        if (this.selected?.id === id) this.selected = null;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to delete template';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async createSurveyFromTemplate(id, payload = {}) {
      this.isMutating = true;
      this.lastError = null;
      try {
        const data = await templateService.createSurvey(id, payload);
        return data?.survey ?? null;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to create survey from template';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    reset() {
      this.items = [];
      this.pagination = null;
      this.selected = null;
      this.lastError = null;
    },
  },
});
