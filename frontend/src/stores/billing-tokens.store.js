import { defineStore } from 'pinia';

import { billingTokensService } from '../services/billing-tokens.service.js';

const DEFAULT_PAGINATION = Object.freeze({ page: 1, limit: 25, total: 0, totalPages: 1 });

/**
 * Pinia store backing the tenant-facing token wallet view: balance, monthly
 * usage, package catalogue, ledger history, and purchase request flow. The
 * backend already scopes data to the calling tenant so the store does not
 * carry tenant ids in its state.
 */
export const useBillingTokensStore = defineStore('billingTokens', {
  state: () => ({
    wallet: null,
    pricing: null,
    limits: null,
    usage: null,
    packages: [],
    purchases: [],
    purchasesPagination: { ...DEFAULT_PAGINATION },
    ledger: [],
    ledgerPagination: { ...DEFAULT_PAGINATION },
    ledgerFilters: { type: '', channel: '' },
    isLoadingBalance: false,
    isLoadingLedger: false,
    isLoadingPackages: false,
    isLoadingPurchases: false,
    isRequesting: false,
    lastError: null,
  }),

  getters: {
    balance: (state) => state.wallet?.balance ?? 0,
  },

  actions: {
    async fetchBalance() {
      this.isLoadingBalance = true;
      this.lastError = null;
      try {
        const data = await billingTokensService.getBalance();
        this.wallet = data?.wallet ?? null;
        this.pricing = data?.pricing ?? null;
        this.limits = data?.limits ?? null;
        this.usage = data?.usage ?? null;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load token balance';
        throw err;
      } finally {
        this.isLoadingBalance = false;
      }
    },

    async fetchPackages() {
      this.isLoadingPackages = true;
      this.lastError = null;
      try {
        const data = await billingTokensService.listPackages();
        this.packages = data?.items ?? [];
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load token packages';
        throw err;
      } finally {
        this.isLoadingPackages = false;
      }
    },

    async fetchLedger(query = {}) {
      this.isLoadingLedger = true;
      this.lastError = null;
      try {
        const merged = {
          page: this.ledgerPagination.page,
          limit: this.ledgerPagination.limit,
          type: this.ledgerFilters.type || undefined,
          channel: this.ledgerFilters.channel || undefined,
          ...query,
        };
        const data = await billingTokensService.listLedger(merged);
        this.ledger = data?.items ?? [];
        this.ledgerPagination = {
          page: data?.pagination?.page ?? 1,
          limit: data?.pagination?.limit ?? DEFAULT_PAGINATION.limit,
          total: data?.pagination?.total ?? this.ledger.length,
          totalPages: data?.pagination?.totalPages ?? 1,
        };
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load ledger';
        throw err;
      } finally {
        this.isLoadingLedger = false;
      }
    },

    setLedgerFilter(key, value) {
      if (!(key in this.ledgerFilters)) return;
      this.ledgerFilters = { ...this.ledgerFilters, [key]: value ?? '' };
      this.ledgerPagination = { ...this.ledgerPagination, page: 1 };
    },

    async fetchPurchases(query = {}) {
      this.isLoadingPurchases = true;
      this.lastError = null;
      try {
        const merged = {
          page: this.purchasesPagination.page,
          limit: this.purchasesPagination.limit,
          ...query,
        };
        const data = await billingTokensService.listPurchases(merged);
        this.purchases = data?.items ?? [];
        this.purchasesPagination = {
          page: data?.pagination?.page ?? 1,
          limit: data?.pagination?.limit ?? DEFAULT_PAGINATION.limit,
          total: data?.pagination?.total ?? this.purchases.length,
          totalPages: data?.pagination?.totalPages ?? 1,
        };
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load purchases';
        throw err;
      } finally {
        this.isLoadingPurchases = false;
      }
    },

    async requestPurchase(packageId, notes) {
      this.isRequesting = true;
      this.lastError = null;
      try {
        const data = await billingTokensService.requestPurchase({ packageId, notes });
        const created = data?.purchase ?? null;
        if (created) this.purchases = [created, ...this.purchases];
        return created;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to request purchase';
        throw err;
      } finally {
        this.isRequesting = false;
      }
    },

    reset() {
      this.wallet = null;
      this.pricing = null;
      this.limits = null;
      this.usage = null;
      this.packages = [];
      this.purchases = [];
      this.purchasesPagination = { ...DEFAULT_PAGINATION };
      this.ledger = [];
      this.ledgerPagination = { ...DEFAULT_PAGINATION };
      this.ledgerFilters = { type: '', channel: '' };
      this.lastError = null;
    },
  },
});
