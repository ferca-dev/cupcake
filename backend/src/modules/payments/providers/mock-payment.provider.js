import crypto from 'node:crypto';

import { normalizePaymentStatus } from './provider.types.js';

const PROVIDER_NAME = 'mock';

/**
 * In-memory provider used for local development and tests. It mirrors the
 * Mercado Pago provider shape so swapping providers is invisible to the rest
 * of the payment module — the only difference is that it never reaches the
 * network. Callers can override `paymentStateFor` to script specific webhook
 * scenarios (approved, rejected, refunded, …).
 */
export const createMockPaymentProvider = ({
  env,
  paymentStateFor = null,
  preapprovalStateFor = null,
  authorizedPaymentStateFor = null,
} = {}) => {
  const preferences = new Map();
  const payments = new Map();
  const preapprovals = new Map();

  const buildId = (prefix) => `${prefix}_${crypto.randomBytes(6).toString('hex')}`;

  return {
    getProviderName() {
      return PROVIDER_NAME;
    },

    async createTokenPackagePreference(input) {
      const preferenceId = buildId('pref');
      const initPoint = `${env?.FRONTEND_URL ?? 'http://localhost:5173'}/billing/payment/mock-checkout?pref=${preferenceId}`;
      const record = {
        preferenceId,
        externalReference: input.externalReference,
        unitPriceMajor: input.unitPriceMajor,
        currency: input.currency,
        payerEmail: input.payerEmail,
        title: input.title,
      };
      preferences.set(preferenceId, record);
      return {
        preferenceId,
        initPoint,
        sandboxInitPoint: initPoint,
        raw: { id: preferenceId, mock: true },
      };
    },

    async fetchPayment(paymentId) {
      if (paymentStateFor) {
        const scripted = await paymentStateFor(paymentId);
        if (scripted) return scripted;
      }
      const fromMap = payments.get(paymentId);
      if (fromMap) return fromMap;
      return {
        id: paymentId,
        status: 'failed',
        rawStatus: 'unknown',
        externalReference: null,
        amountMinor: null,
        currency: null,
        payerEmail: null,
        preferenceId: null,
        paidAt: null,
        raw: { mock: true },
      };
    },

    async createPreapproval(input) {
      const preapprovalId = buildId('preapp');
      const initPoint = `${env?.FRONTEND_URL ?? 'http://localhost:5173'}/billing/subscription/mock-checkout?preapproval=${preapprovalId}`;
      const record = {
        preapprovalId,
        externalReference: input.externalReference,
        payerEmail: input.payerEmail,
        amountMajor: input.amountMajor,
        currency: input.currency,
        status: 'pending',
      };
      preapprovals.set(preapprovalId, record);
      return {
        preapprovalId,
        initPoint,
        status: 'pending',
        raw: { id: preapprovalId, mock: true },
      };
    },

    async fetchPreapproval(preapprovalId) {
      if (preapprovalStateFor) {
        const scripted = await preapprovalStateFor(preapprovalId);
        if (scripted) return scripted;
      }
      const rec = preapprovals.get(preapprovalId);
      return {
        id: preapprovalId,
        status: rec?.status ?? 'pending',
        rawStatus: rec?.status ?? 'pending',
        externalReference: rec?.externalReference ?? null,
        payerEmail: rec?.payerEmail ?? null,
        amountMinor: rec ? Math.round(Number(rec.amountMajor ?? 0) * 100) : null,
        currency: rec?.currency ?? null,
        nextPaymentDate: null,
        raw: rec ?? { mock: true },
      };
    },

    async updatePreapprovalStatus(preapprovalId, status) {
      const rec = preapprovals.get(preapprovalId);
      if (rec) rec.status = status;
      return {
        id: preapprovalId,
        status,
        rawStatus: status,
        externalReference: rec?.externalReference ?? null,
        payerEmail: rec?.payerEmail ?? null,
        amountMinor: rec ? Math.round(Number(rec.amountMajor ?? 0) * 100) : null,
        currency: rec?.currency ?? null,
        nextPaymentDate: null,
        raw: rec ?? { mock: true },
      };
    },

    async fetchAuthorizedPayment(authorizedPaymentId) {
      if (authorizedPaymentStateFor) {
        const scripted = await authorizedPaymentStateFor(authorizedPaymentId);
        if (scripted) return scripted;
      }
      return {
        id: authorizedPaymentId,
        status: 'scheduled',
        rawStatus: 'scheduled',
        preapprovalId: null,
        amountMinor: null,
        currency: null,
        paymentDate: null,
        periodStart: null,
        periodEnd: null,
        paymentId: null,
        raw: { mock: true },
      };
    },

    // Tests bypass signature checks by default; suites that want to exercise
    // the verification path can opt-in by injecting a real Mercado Pago
    // provider with a configured secret.
    verifyWebhookSignature() {
      return true;
    },

    // Helpers exposed only for tests — let a suite "approve" a previously
    // created preference and have `fetchPayment` return that state.
    _setPaymentState(paymentId, state) {
      payments.set(paymentId, { ...state, id: paymentId });
    },
    _setPreapprovalState(preapprovalId, state) {
      preapprovals.set(preapprovalId, { ...(preapprovals.get(preapprovalId) ?? {}), ...state });
    },
    _getPreference(preferenceId) {
      return preferences.get(preferenceId);
    },
    _normalizePaymentStatus: normalizePaymentStatus,
  };
};

export const MOCK_PROVIDER_NAME = PROVIDER_NAME;
