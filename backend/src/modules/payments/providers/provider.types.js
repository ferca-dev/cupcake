/**
 * Payment provider contract. Every adapter — Mercado Pago, mock for tests,
 * any future Stripe/PayPal addition — must expose this interface. The
 * payment service never imports Mercado Pago types directly; it only goes
 * through the factory, so adding a provider is additive.
 *
 * @typedef {Object} CreatePreferenceInput
 * @property {string} externalReference - Unique key Cupcake controls.
 * @property {string} title - Customer-facing line-item title.
 * @property {string} description - Optional longer description.
 * @property {number} quantity
 * @property {number} unitPriceMajor - Amount in major units (e.g. USD 19.90).
 * @property {string} currency - ISO 4217.
 * @property {string|null} payerEmail
 * @property {Object} metadata - Free-form metadata.
 *
 * @typedef {Object} CreatePreferenceResult
 * @property {string} preferenceId
 * @property {string} initPoint - URL the payer should be redirected to.
 * @property {string|null} sandboxInitPoint
 * @property {Object} raw - Raw provider response (for storage).
 *
 * @typedef {Object} FetchedPayment
 * @property {string} id
 * @property {string} status - Normalised internal status.
 * @property {string} rawStatus - Untouched provider status.
 * @property {string|null} externalReference
 * @property {number|null} amountMinor
 * @property {string|null} currency
 * @property {string|null} payerEmail
 * @property {string|null} preferenceId
 * @property {string|null} paidAt - ISO timestamp.
 * @property {Object} raw
 *
 * @typedef {Object} CreatePreapprovalInput
 * @property {string} externalReference
 * @property {string} reason
 * @property {string} payerEmail
 * @property {number} amountMajor - Major unit amount.
 * @property {string} currency
 * @property {number} frequency - Numeric interval count.
 * @property {string} frequencyType - 'months' | 'years'.
 * @property {string|null} backUrl
 * @property {string|null} planId - Optional pre-created plan id.
 *
 * @typedef {Object} CreatePreapprovalResult
 * @property {string} preapprovalId
 * @property {string} initPoint
 * @property {string} status - Normalised status.
 * @property {Object} raw
 *
 * @typedef {Object} FetchedPreapproval
 * @property {string} id
 * @property {string} status
 * @property {string} rawStatus
 * @property {string|null} externalReference
 * @property {string|null} payerEmail
 * @property {number|null} amountMinor
 * @property {string|null} currency
 * @property {Date|null} nextPaymentDate
 * @property {Object} raw
 *
 * @typedef {Object} FetchedAuthorizedPayment
 * @property {string} id
 * @property {string} status
 * @property {string} rawStatus
 * @property {string|null} preapprovalId
 * @property {number|null} amountMinor
 * @property {string|null} currency
 * @property {Date|null} paymentDate
 * @property {Date|null} periodStart
 * @property {Date|null} periodEnd
 * @property {string|null} paymentId
 * @property {Object} raw
 *
 * @typedef {Object} PaymentProvider
 * @property {() => string} getProviderName
 * @property {(input: CreatePreferenceInput) => Promise<CreatePreferenceResult>} createTokenPackagePreference
 * @property {(paymentId: string) => Promise<FetchedPayment>} fetchPayment
 * @property {(input: CreatePreapprovalInput) => Promise<CreatePreapprovalResult>} createPreapproval
 * @property {(preapprovalId: string) => Promise<FetchedPreapproval>} fetchPreapproval
 * @property {(preapprovalId: string, status: 'paused'|'cancelled'|'authorized') => Promise<FetchedPreapproval>} updatePreapprovalStatus
 * @property {(authorizedPaymentId: string) => Promise<FetchedAuthorizedPayment>} fetchAuthorizedPayment
 * @property {(payload: Buffer|string, headers: Object) => boolean} verifyWebhookSignature
 */

/**
 * Map raw Mercado Pago statuses (or any provider status string) into the
 * internal `PaymentTransaction.status` enum. Exported so adapters and tests
 * can share one implementation.
 */
export const normalizePaymentStatus = (rawStatus) => {
  switch (rawStatus) {
    case 'approved':
      return 'approved';
    case 'pending':
      return 'pending';
    case 'in_process':
    case 'in_mediation':
      return 'in_process';
    case 'rejected':
      return 'rejected';
    case 'cancelled':
      return 'cancelled';
    case 'refunded':
      return 'refunded';
    case 'charged_back':
      return 'charged_back';
    case 'authorized':
      return 'approved';
    default:
      return 'failed';
  }
};

/**
 * Map raw Mercado Pago preapproval statuses into the internal subscription
 * status enum.
 */
export const normalizePreapprovalStatus = (rawStatus) => {
  switch (rawStatus) {
    case 'authorized':
      return 'authorized';
    case 'paused':
      return 'paused';
    case 'cancelled':
      return 'cancelled';
    case 'expired':
      return 'expired';
    case 'pending':
    default:
      return 'pending';
  }
};

/**
 * Map raw authorized-payment statuses to invoice statuses.
 */
export const normalizeAuthorizedPaymentStatus = (rawStatus) => {
  switch (rawStatus) {
    case 'processed':
      return 'processed';
    case 'scheduled':
      return 'scheduled';
    case 'recycling':
      return 'recycling';
    case 'rejected':
      return 'rejected';
    case 'cancelled':
      return 'cancelled';
    case 'refunded':
      return 'refunded';
    default:
      return 'scheduled';
  }
};
