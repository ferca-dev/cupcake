import mongoose from 'mongoose';

import { WEBHOOK_EVENT_TYPE_VALUES } from './webhook-events.js';

const { Schema, Types } = mongoose;

export const WEBHOOK_DELIVERY_STATUSES = Object.freeze([
  'pending',
  'in_progress',
  'succeeded',
  'failed',
  'dead_letter',
]);

/**
 * Persistent record of a single outbound delivery attempt to a webhook
 * endpoint. The model keeps the latest attempt summary plus a bounded list
 * of past attempts so the UI can show the retry history without hitting the
 * job queue collection.
 */
const attemptSchema = new Schema(
  {
    attemptNumber: { type: Number, required: true, min: 1 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },
    statusCode: { type: Number, default: null },
    success: { type: Boolean, default: false },
    error: { type: String, default: null },
    responseBodySnippet: { type: String, default: null },
  },
  { _id: false },
);

const webhookDeliverySchema = new Schema(
  {
    tenantId: { type: Types.ObjectId, ref: 'Tenant', required: true, index: true },
    endpointId: { type: Types.ObjectId, ref: 'WebhookEndpoint', required: true, index: true },
    eventId: { type: String, required: true, unique: true },
    eventType: { type: String, enum: WEBHOOK_EVENT_TYPE_VALUES, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: WEBHOOK_DELIVERY_STATUSES,
      default: 'pending',
      required: true,
      index: true,
    },
    attempts: { type: Number, default: 0, min: 0 },
    maxAttempts: { type: Number, default: 5, min: 1 },
    nextAttemptAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    lastAttempt: { type: attemptSchema, default: null },
    attemptHistory: { type: [attemptSchema], default: [] },
    triggeredBy: { type: String, default: 'system', maxlength: 96 },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

webhookDeliverySchema.index({ tenantId: 1, endpointId: 1, createdAt: -1 });
webhookDeliverySchema.index({ status: 1, nextAttemptAt: 1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

webhookDeliverySchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
webhookDeliverySchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const WebhookDelivery =
  mongoose.models.WebhookDelivery ?? mongoose.model('WebhookDelivery', webhookDeliverySchema);
