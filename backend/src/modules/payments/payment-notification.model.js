import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

// One row per outbound payment-related email. The `(idempotencyKey)` unique
// index is what makes the email pipeline safe under Mercado Pago retries: the
// service generates a deterministic key (e.g. `payment_approved:<paymentId>`)
// and the duplicate-key error tells the caller the email was already sent.

export const PAYMENT_NOTIFICATION_TYPES = Object.freeze([
  // One-time token purchase lifecycle.
  'token_payment_pending',
  'token_payment_approved',
  'token_payment_rejected',
  'token_payment_cancelled',
  'token_payment_refunded',
  'token_payment_manual_review',
  // Subscription lifecycle.
  'subscription_created',
  'subscription_activated',
  'subscription_paused',
  'subscription_cancelled',
  'subscription_renewal_upcoming',
  'subscription_payment_approved',
  'subscription_payment_failed',
  'subscription_payment_retry',
  // Wallet reminders.
  'low_token_balance',
]);

export const PAYMENT_NOTIFICATION_STATUSES = Object.freeze([
  'pending',
  'sent',
  'failed',
  'skipped',
]);

const notificationSchema = new Schema(
  {
    tenantId: { type: Types.ObjectId, ref: 'Tenant', required: true, index: true },
    userId: { type: Types.ObjectId, ref: 'User', default: null },
    type: { type: String, enum: PAYMENT_NOTIFICATION_TYPES, required: true },
    referenceType: { type: String, default: null },
    referenceId: { type: String, default: null },
    recipientEmail: { type: String, required: true },
    subject: { type: String, default: null },
    status: { type: String, enum: PAYMENT_NOTIFICATION_STATUSES, default: 'pending' },
    sentAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
    idempotencyKey: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: false },
);

notificationSchema.index({ idempotencyKey: 1 }, { unique: true });
notificationSchema.index({ tenantId: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

notificationSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
notificationSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const PaymentNotification =
  mongoose.models.PaymentNotification ??
  mongoose.model('PaymentNotification', notificationSchema);
