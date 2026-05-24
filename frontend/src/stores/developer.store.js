import { defineStore } from 'pinia';

import { developerService } from '../services/developer.service.js';

/**
 * Holds the workspace developer integration state: API keys, webhook
 * endpoints, the latest revealed raw key/secret (kept in memory only for the
 * lifetime of the view), and the delivery log for the currently inspected
 * endpoint. Mutations re-fetch the affected list so the UI always reflects
 * the persisted state.
 */
export const useDeveloperStore = defineStore('developer', {
  state: () => ({
    apiKeys: [],
    webhooks: [],
    deliveries: [],
    deliveryPagination: null,
    inspectedEndpointId: null,
    lastRevealedApiKey: null,
    lastRevealedWebhookSecret: null,
    lastTestResult: null,
    isLoadingApiKeys: false,
    isLoadingWebhooks: false,
    isLoadingDeliveries: false,
    isMutating: false,
    lastError: null,
    lastSuccess: null,
  }),

  getters: {
    activeApiKeys: (state) => state.apiKeys.filter((k) => k.status === 'active'),
    activeWebhooks: (state) => state.webhooks.filter((w) => w.status === 'active'),
  },

  actions: {
    resetMessages() {
      this.lastError = null;
      this.lastSuccess = null;
    },

    clearRevealedSecrets() {
      this.lastRevealedApiKey = null;
      this.lastRevealedWebhookSecret = null;
    },

    async fetchApiKeys() {
      this.isLoadingApiKeys = true;
      this.resetMessages();
      try {
        const data = await developerService.listApiKeys();
        this.apiKeys = data?.items ?? [];
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load API keys';
        throw err;
      } finally {
        this.isLoadingApiKeys = false;
      }
    },

    async createApiKey(payload) {
      this.isMutating = true;
      this.resetMessages();
      try {
        const data = await developerService.createApiKey(payload);
        // The raw key is only visible right now — copy it before navigating
        // away. We persist it in store state so the modal can keep showing
        // it as long as the page is open.
        this.lastRevealedApiKey = data?.apiKey ?? null;
        this.lastSuccess = 'api_key_created';
        await this.fetchApiKeys();
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to create API key';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async rotateApiKey(id) {
      this.isMutating = true;
      this.resetMessages();
      try {
        const data = await developerService.rotateApiKey(id);
        this.lastRevealedApiKey = data?.replacement ?? null;
        this.lastSuccess = 'api_key_rotated';
        await this.fetchApiKeys();
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to rotate API key';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async revokeApiKey(id) {
      this.isMutating = true;
      this.resetMessages();
      try {
        const data = await developerService.revokeApiKey(id);
        this.lastSuccess = 'api_key_revoked';
        await this.fetchApiKeys();
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to revoke API key';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async deleteApiKey(id) {
      this.isMutating = true;
      this.resetMessages();
      try {
        const data = await developerService.deleteApiKey(id);
        this.lastSuccess = 'api_key_deleted';
        await this.fetchApiKeys();
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to delete API key';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async fetchWebhooks() {
      this.isLoadingWebhooks = true;
      this.resetMessages();
      try {
        const data = await developerService.listWebhooks();
        this.webhooks = data?.items ?? [];
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load webhook endpoints';
        throw err;
      } finally {
        this.isLoadingWebhooks = false;
      }
    },

    async createWebhook(payload) {
      this.isMutating = true;
      this.resetMessages();
      try {
        const data = await developerService.createWebhook(payload);
        this.lastRevealedWebhookSecret = data?.endpoint?.secret ?? null;
        this.lastSuccess = 'webhook_created';
        await this.fetchWebhooks();
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to create webhook endpoint';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async updateWebhook(id, payload) {
      this.isMutating = true;
      this.resetMessages();
      try {
        const data = await developerService.updateWebhook(id, payload);
        if (payload.rotateSecret && data?.endpoint?.secret) {
          this.lastRevealedWebhookSecret = data.endpoint.secret;
        }
        this.lastSuccess = payload.rotateSecret ? 'webhook_secret_rotated' : 'webhook_updated';
        await this.fetchWebhooks();
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to update webhook endpoint';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async deleteWebhook(id) {
      this.isMutating = true;
      this.resetMessages();
      try {
        const data = await developerService.deleteWebhook(id);
        this.lastSuccess = 'webhook_deleted';
        if (this.inspectedEndpointId === id) {
          this.inspectedEndpointId = null;
          this.deliveries = [];
          this.deliveryPagination = null;
        }
        await this.fetchWebhooks();
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to delete webhook endpoint';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async fetchDeliveries(id, query = {}) {
      this.isLoadingDeliveries = true;
      this.resetMessages();
      try {
        const data = await developerService.listDeliveries(id, query);
        this.inspectedEndpointId = id;
        this.deliveries = data?.items ?? [];
        this.deliveryPagination = data?.pagination ?? null;
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load delivery log';
        throw err;
      } finally {
        this.isLoadingDeliveries = false;
      }
    },

    async sendTestEvent(id, payload = {}) {
      this.isMutating = true;
      this.resetMessages();
      try {
        const data = await developerService.sendTestEvent(id, payload);
        this.lastTestResult = data;
        this.lastSuccess = data?.delivered ? 'test_event_delivered' : 'test_event_failed';
        if (this.inspectedEndpointId === id) {
          await this.fetchDeliveries(id);
        }
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to send test event';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },
  },
});
