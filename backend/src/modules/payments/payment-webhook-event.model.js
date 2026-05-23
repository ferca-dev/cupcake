import mongoose from 'mongoose';

const { Schema } = mongoose;

// Immutable log of every webhook delivery we accept from a payment provider.
// The unique compound index on `(provider, providerEventId)` is the single
// guarantee that repeated deliveries can never double-process a payment: the
// service inserts a record first and lets the duplicate key collision short-
// circuit the rest of the handler.

export const WEBHOOK_PROCESSED_STATUSES = Object.freeze([
  'received',
  'processed',
  'skipped',
  'failed',
]);

const webhookEventSchema = new Schema(
  {
    provider: { type: String, required: true, index: true },
    providerEventId: { type: String, required: true },
    eventType: { type: String, required: true },
    resourceType: { type: String, default: null },
    resourceId: { type: String, default: null, index: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    signatureValid: { type: Boolean, default: null },
    status: { type: String, enum: WEBHOOK_PROCESSED_STATUSES, default: 'received', index: true },
    processedAt: { type: Date, default: null },
    processingError: { type: String, default: null },
    relatedTransactionId: {
      type: Schema.Types.ObjectId,
      ref: 'PaymentTransaction',
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

webhookEventSchema.index({ provider: 1, providerEventId: 1 }, { unique: true });
webhookEventSchema.index({ createdAt: -1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

webhookEventSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
webhookEventSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const PaymentWebhookEvent =
  mongoose.models.PaymentWebhookEvent ??
  mongoose.model('PaymentWebhookEvent', webhookEventSchema);
