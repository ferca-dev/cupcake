import { defineStore } from 'pinia';

import { adminTokensService } from '../services/admin-tokens.service.js';

/**
 * Owns every super-admin token-configuration screen: packages, channel
 * pricing, pending purchases, and per-tenant wallet/limits inspection.
 *
 * Tenant-specific data (`tenantWallet`, `tenantUsage`, `tenantLimits`) lives
 * in this store rather than a separate one so the admin "tenant token
 * detail" panel can mix wallet, limits, and adjustment actions in a single
 * view without extra coordination.
 */
export const useAdminTokensStore = defineStore('adminTokens', {
  state: () => ({
    packages: [],
    isLoadingPackages: false,

    channelPricing: [],
    isLoadingChannelPricing: false,

    pendingPurchases: [],
    isLoadingPurchases: false,

    tenantWallet: null,
    tenantUsage: null,
    tenantLimits: null,
    isLoadingTenant: false,

    isMutating: false,
    lastError: null,
  }),

  getters: {
    activePackages: (state) => state.packages.filter((p) => p.status === 'active'),
    pendingPurchaseCount: (state) => state.pendingPurchases.length,
  },

  actions: {
    async fetchPackages() {
      this.isLoadingPackages = true;
      this.lastError = null;
      try {
        const data = await adminTokensService.listPackages({ limit: 100 });
        this.packages = data?.items ?? [];
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load token packages';
        throw err;
      } finally {
        this.isLoadingPackages = false;
      }
    },

    async createPackage(payload) {
      this.isMutating = true;
      this.lastError = null;
      try {
        const data = await adminTokensService.createPackage(payload);
        const created = data?.package ?? null;
        if (created) this.packages = [created, ...this.packages];
        return created;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to create package';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async updatePackage(id, payload) {
      this.isMutating = true;
      this.lastError = null;
      try {
        const data = await adminTokensService.updatePackage(id, payload);
        const updated = data?.package ?? null;
        if (updated) this.packages = this.packages.map((p) => (p.id === id ? updated : p));
        return updated;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to update package';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async togglePackageStatus(id, status) {
      this.isMutating = true;
      this.lastError = null;
      try {
        const data = await adminTokensService.updatePackageStatus(id, { status });
        const updated = data?.package ?? null;
        if (updated) this.packages = this.packages.map((p) => (p.id === id ? updated : p));
        return updated;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to update package status';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async fetchChannelPricing() {
      this.isLoadingChannelPricing = true;
      this.lastError = null;
      try {
        const data = await adminTokensService.listChannelPricing();
        this.channelPricing = data?.items ?? [];
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load channel pricing';
        throw err;
      } finally {
        this.isLoadingChannelPricing = false;
      }
    },

    async updateChannelPricing(payload) {
      this.isMutating = true;
      this.lastError = null;
      try {
        const data = await adminTokensService.updateChannelPricing(payload);
        const updated = data?.rule;
        if (updated) {
          this.channelPricing = this.channelPricing.map((row) =>
            row.channel === updated.channel ? { ...row, ...updated } : row,
          );
        }
        return updated;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to update channel pricing';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async fetchPendingPurchases() {
      this.isLoadingPurchases = true;
      this.lastError = null;
      try {
        const data = await adminTokensService.listPurchases({ status: 'pending', limit: 100 });
        this.pendingPurchases = data?.items ?? [];
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load purchases';
        throw err;
      } finally {
        this.isLoadingPurchases = false;
      }
    },

    async approvePurchase(id, decisionNotes) {
      this.isMutating = true;
      this.lastError = null;
      try {
        await adminTokensService.approvePurchase(id, { decisionNotes });
        this.pendingPurchases = this.pendingPurchases.filter((p) => p.id !== id);
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to approve purchase';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async rejectPurchase(id, decisionNotes) {
      this.isMutating = true;
      this.lastError = null;
      try {
        await adminTokensService.rejectPurchase(id, { decisionNotes });
        this.pendingPurchases = this.pendingPurchases.filter((p) => p.id !== id);
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to reject purchase';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async fetchTenantWalletData(tenantId) {
      this.isLoadingTenant = true;
      this.lastError = null;
      try {
        const [walletData, limitsData] = await Promise.all([
          adminTokensService.getTenantWallet(tenantId),
          adminTokensService.getTenantSendLimits(tenantId),
        ]);
        this.tenantWallet = walletData?.wallet ?? null;
        this.tenantUsage = walletData?.usage ?? null;
        this.tenantLimits = limitsData?.limits ?? null;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load tenant token data';
        throw err;
      } finally {
        this.isLoadingTenant = false;
      }
    },

    async updateTenantSendLimits(tenantId, payload) {
      this.isMutating = true;
      this.lastError = null;
      try {
        const data = await adminTokensService.updateTenantSendLimits(tenantId, payload);
        this.tenantLimits = data?.limits ?? this.tenantLimits;
        return data?.limits;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to update send limits';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async adjustTenantWallet(tenantId, payload) {
      this.isMutating = true;
      this.lastError = null;
      try {
        const data = await adminTokensService.adjustTenantWallet(tenantId, payload);
        this.tenantWallet = data?.wallet ?? this.tenantWallet;
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to adjust wallet';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    resetTenant() {
      this.tenantWallet = null;
      this.tenantUsage = null;
      this.tenantLimits = null;
    },
  },
});
