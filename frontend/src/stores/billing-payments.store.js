import { defineStore } from 'pinia';

import { billingPaymentsService } from '../services/billing-payments.service.js';

const DEFAULT_PAGINATION = Object.freeze({ page: 1, limit: 25, total: 0, totalPages: 1 });

/**
 * Tenant-facing payments + subscriptions store. The store owns the active
 * subscription, the payment history, the available plans, and the latest
 * checkout preference (used to render the Mercado Pago wallet brick or to
 * redirect to `init_point` when the SDK is unavailable).
 */
export const useBillingPaymentsStore = defineStore('billingPayments', {
  state: () => ({
    payments: [],
    paymentsPagination: { ...DEFAULT_PAGINATION },
    subscriptions: [],
    plans: [],
    invoices: [],
    invoicesPagination: { ...DEFAULT_PAGINATION },
    latestPreference: null,
    latestSubscriptionPreapproval: null,
    isLoadingPayments: false,
    isLoadingSubscriptions: false,
    isLoadingPlans: false,
    isLoadingInvoices: false,
    isCreatingPreference: false,
    isCreatingSubscription: false,
    isMutatingSubscription: false,
    lastError: null,
  }),

  getters: {
    activeSubscription: (state) =>
      state.subscriptions.find((s) => ['pending', 'authorized', 'paused'].includes(s.status)) ??
      null,
  },

  actions: {
    async fetchPayments(query = {}) {
      this.isLoadingPayments = true;
      this.lastError = null;
      try {
        const data = await billingPaymentsService.listPayments(query);
        this.payments = data?.items ?? [];
        this.paymentsPagination = {
          page: data?.pagination?.page ?? 1,
          limit: data?.pagination?.limit ?? DEFAULT_PAGINATION.limit,
          total: data?.pagination?.total ?? this.payments.length,
          totalPages: data?.pagination?.totalPages ?? 1,
        };
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load payments';
        throw err;
      } finally {
        this.isLoadingPayments = false;
      }
    },

    async createPreference(packageId, payerEmail = null) {
      this.isCreatingPreference = true;
      this.lastError = null;
      try {
        const data = await billingPaymentsService.createPreference({
          packageId,
          payerEmail: payerEmail || undefined,
        });
        this.latestPreference = data?.preference ?? null;
        if (data?.transaction) {
          this.payments = [data.transaction, ...this.payments];
        }
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to create Mercado Pago preference';
        throw err;
      } finally {
        this.isCreatingPreference = false;
      }
    },

    async fetchSubscriptions(query = {}) {
      this.isLoadingSubscriptions = true;
      this.lastError = null;
      try {
        const data = await billingPaymentsService.listSubscriptions(query);
        this.subscriptions = data?.items ?? [];
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load subscriptions';
        throw err;
      } finally {
        this.isLoadingSubscriptions = false;
      }
    },

    async fetchPlans() {
      this.isLoadingPlans = true;
      this.lastError = null;
      try {
        const data = await billingPaymentsService.listSubscriptionPlans();
        this.plans = data?.items ?? [];
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load plans';
        throw err;
      } finally {
        this.isLoadingPlans = false;
      }
    },

    async createSubscription(planId, payerEmail = null) {
      this.isCreatingSubscription = true;
      this.lastError = null;
      try {
        const data = await billingPaymentsService.createSubscription({
          planId,
          payerEmail: payerEmail || undefined,
        });
        this.latestSubscriptionPreapproval = data?.preapproval ?? null;
        if (data?.subscription) {
          this.subscriptions = [data.subscription, ...this.subscriptions];
        }
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to create subscription';
        throw err;
      } finally {
        this.isCreatingSubscription = false;
      }
    },

    async cancelSubscription(id) {
      this.isMutatingSubscription = true;
      this.lastError = null;
      try {
        const data = await billingPaymentsService.cancelSubscription(id);
        if (data?.subscription) {
          this.subscriptions = this.subscriptions.map((s) => (s.id === id ? data.subscription : s));
        }
        return data?.subscription ?? null;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to cancel subscription';
        throw err;
      } finally {
        this.isMutatingSubscription = false;
      }
    },

    async resumeSubscription(id) {
      this.isMutatingSubscription = true;
      this.lastError = null;
      try {
        const data = await billingPaymentsService.resumeSubscription(id);
        if (data?.subscription) {
          this.subscriptions = this.subscriptions.map((s) => (s.id === id ? data.subscription : s));
        }
        return data?.subscription ?? null;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to resume subscription';
        throw err;
      } finally {
        this.isMutatingSubscription = false;
      }
    },

    async pauseSubscription(id) {
      this.isMutatingSubscription = true;
      this.lastError = null;
      try {
        const data = await billingPaymentsService.pauseSubscription(id);
        if (data?.subscription) {
          this.subscriptions = this.subscriptions.map((s) => (s.id === id ? data.subscription : s));
        }
        return data?.subscription ?? null;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to pause subscription';
        throw err;
      } finally {
        this.isMutatingSubscription = false;
      }
    },

    async fetchInvoices(query = {}) {
      this.isLoadingInvoices = true;
      this.lastError = null;
      try {
        const data = await billingPaymentsService.listInvoices(query);
        this.invoices = data?.items ?? [];
        this.invoicesPagination = {
          page: data?.pagination?.page ?? 1,
          limit: data?.pagination?.limit ?? DEFAULT_PAGINATION.limit,
          total: data?.pagination?.total ?? this.invoices.length,
          totalPages: data?.pagination?.totalPages ?? 1,
        };
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load invoices';
        throw err;
      } finally {
        this.isLoadingInvoices = false;
      }
    },

    reset() {
      this.payments = [];
      this.paymentsPagination = { ...DEFAULT_PAGINATION };
      this.subscriptions = [];
      this.plans = [];
      this.invoices = [];
      this.invoicesPagination = { ...DEFAULT_PAGINATION };
      this.latestPreference = null;
      this.latestSubscriptionPreapproval = null;
      this.lastError = null;
    },
  },
});
