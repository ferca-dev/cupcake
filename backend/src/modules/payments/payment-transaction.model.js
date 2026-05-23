import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

// Provider-agnostic payment transaction. Every Mercado Pago payment, refund,
// or charge-back is stored as one of these so the existing tenant billing
// surfaces (and any future reconciliation jobs) have a single source of truth.
//
//   - `provider` records which adapter created the record (`mercadopago`,
//     `mock`, …).
//   - `status` covers the union of Mercado Pago payment states we care about.
//     The provider adapter maps raw statuses into this set.
//   - `amountMinor` is stored in integer minor currency units to match the
//     existing transactions model and avoid floating-point drift.
//   - `externalReference` is the deterministic key we embed in the Mercado
//     Pago preference/preapproval and use to resolve the record back when the
//     webhook arrives.
//   - `tokenCredited` flips to `true` exactly once when the token wallet
//     receives the purchased tokens. The webhook handler refuses to credit
//     twice, which keeps the operation idempotent under retries.

export const PAYMENT_PROVIDERS = Object.freeze(['mercadopago', 'mock']);

export const PAYMENT_PURPOSES = Object.freeze([
  'token_package',
  'subscription_initial',
  'subscription_renewal',
]);

export const PAYMENT_STATUSES = Object.freeze([
  'pending',
  'in_process',
  'approved',
  'rejected',
  'cancelled',
  'refunded',
  'charged_back',
  'failed',
  'manual_review',
]);

const ISO_CURRENCY_REGEX = /^[A-Z]{3}$/;

const paymentTransactionSchema = new Schema(
  {
    tenantId: { type: Types.ObjectId, ref: 'Tenant', required: true, index: true },
    provider: { type: String, enum: PAYMENT_PROVIDERS, required: true },
    purpose: { type: String, enum: PAYMENT_PURPOSES, required: true },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'pending', index: true },

    // Money — keep as integer minor units, currency uppercase ISO 4217.
    amountMinor: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'amountMinor must be an integer (minor currency units)',
      },
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      match: [ISO_CURRENCY_REGEX, 'currency must be a 3-letter ISO 4217 code'],
    },

    // Domain references. We snapshot the package data so historical purchases
    // survive package edits/deletions.
    packageId: { type: Types.ObjectId, ref: 'TokenPackage', default: null },
    packageName: { type: String, default: null },
    tokensToCredit: { type: Number, default: 0, min: 0 },
    tokenPurchaseId: { type: Types.ObjectId, ref: 'TokenPurchase', default: null, index: true },
    subscriptionId: {
      type: Types.ObjectId,
      ref: 'TenantSubscription',
      default: null,
      index: true,
    },
    subscriptionInvoiceId: {
      type: Types.ObjectId,
      ref: 'SubscriptionInvoice',
      default: null,
    },

    // External identifiers shared between Cupcake and the provider.
    externalReference: { type: String, required: true, index: true },
    providerPreferenceId: { type: String, default: null, index: true },
    providerPaymentId: { type: String, default: null, index: true, sparse: true },
    providerPayerEmail: { type: String, default: null },
    checkoutUrl: { type: String, default: null },
    initPoint: { type: String, default: null },

    // Idempotency markers. Once tokens have been credited the wallet is never
    // touched again for this transaction.
    tokenCredited: { type: Boolean, default: false },
    tokenLedgerEntryId: { type: Types.ObjectId, ref: 'TokenLedgerEntry', default: null },

    requestedBy: { type: Types.ObjectId, ref: 'User', default: null },
    paidAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

paymentTransactionSchema.index({ tenantId: 1, createdAt: -1 });
paymentTransactionSchema.index({ tenantId: 1, status: 1 });
paymentTransactionSchema.index({ tenantId: 1, purpose: 1 });
paymentTransactionSchema.index({ externalReference: 1 }, { unique: true });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

paymentTransactionSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: toPublic,
});
paymentTransactionSchema.set('toObject', {
  virtuals: true,
  versionKey: false,
  transform: toPublic,
});

export const PaymentTransaction =
  mongoose.models.PaymentTransaction ??
  mongoose.model('PaymentTransaction', paymentTransactionSchema);
