import { defineStore } from 'pinia';

import { campaignService } from '../services/campaign.service.js';

const DEFAULT_PAGINATION = Object.freeze({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 1,
});

export const useCampaignsStore = defineStore('campaigns', {
  state: () => ({
    campaigns: [],
    pagination: { ...DEFAULT_PAGINATION },
    currentCampaign: null,
    currentRecipients: [],
    currentReport: null,
    isLoading: false,
    isLoadingDetail: false,
    isSending: false,
    lastError: null,
  }),

  actions: {
    async fetchCampaigns(query = {}) {
      this.isLoading = true;
      this.lastError = null;
      try {
        const data = await campaignService.list({ limit: 50, sort: '-createdAt', ...query });
        this.campaigns = data?.items ?? [];
        this.pagination = {
          page: data?.pagination?.page ?? 1,
          limit: data?.pagination?.limit ?? 50,
          total: data?.pagination?.total ?? this.campaigns.length,
          totalPages: data?.pagination?.totalPages ?? 1,
        };
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load campaigns';
        throw err;
      } finally {
        this.isLoading = false;
      }
    },

    async createCampaign(payload) {
      const data = await campaignService.create(payload);
      if (data?.campaign) {
        this.campaigns = [data.campaign, ...this.campaigns];
      }
      return data?.campaign ?? null;
    },

    async fetchCampaignDetail(id) {
      this.isLoadingDetail = true;
      this.lastError = null;
      try {
        const [detail, recipients, report] = await Promise.all([
          campaignService.get(id),
          campaignService.listRecipients(id, { limit: 100, sort: 'createdAt' }),
          campaignService.getReport(id),
        ]);
        this.currentCampaign = detail?.campaign ?? null;
        this.currentRecipients = recipients?.items ?? [];
        this.currentReport = report?.report ?? null;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load campaign';
        throw err;
      } finally {
        this.isLoadingDetail = false;
      }
    },

    async sendCampaign(id) {
      this.isSending = true;
      this.lastError = null;
      try {
        const data = await campaignService.send(id);
        if (data?.campaign) {
          this.currentCampaign = data.campaign;
          this.campaigns = this.campaigns.map((c) => (c.id === id ? data.campaign : c));
        }
        // Refresh recipients/report so the detail view stays consistent.
        await this.fetchCampaignDetail(id);
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to send campaign';
        throw err;
      } finally {
        this.isSending = false;
      }
    },

    resetCurrent() {
      this.currentCampaign = null;
      this.currentRecipients = [];
      this.currentReport = null;
    },
  },
});
