import mongoose from 'mongoose';

import { WEBHOOK_EVENT_TYPE_VALUES } from './webhook-events.js';

const { Schema, Types } = mongoose;

export const WEBHOOK_ENDPOINT_STATUSES = Object.freeze(['active', 'paused', 'disabled']);

/**
 * Tenant-configured destination for outbound webhook deliveries. Each
 * endpoint stores its own HMAC secret so rotating it does not invalidate
 * peers, and a status flag so a tenant can pause delivery without losing
 * configuration.
 *
 * `consecutiveFailures`/`lastFailureAt` are bookkeeping the dispatcher uses
 * to surface degraded endpoints in the UI; they do not gate retries.
 */
const webhookEndpointSchema = new Schema(
  {
    tenantId: { type: Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: null, trim: true, maxlength: 500 },
    url: { type: String, required: true, trim: true, maxlength: 2048 },
    secret: { type: String, required: true },
    events: {
      type: [{ type: String, enum: WEBHOOK_EVENT_TYPE_VALUES }],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'At least one event subscription is required',
      },
    },
    status: { type: String, enum: WEBHOOK_ENDPOINT_STATUSES, default: 'active', index: true },
    createdBy: { type: Types.ObjectId, ref: 'User', required: true },
    lastDeliveryAt: { type: Date, default: null },
    lastSuccessAt: { type: Date, default: null },
    lastFailureAt: { type: Date, default: null },
    consecutiveFailures: { type: Number, default: 0, min: 0 },
    metadata: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

webhookEndpointSchema.index({ tenantId: 1, createdAt: -1 });
webhookEndpointSchema.index({ tenantId: 1, status: 1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  // Secret is sensitive — only the dispatcher needs it. Routes return the
  // secret in the response body only on create/rotate.
  delete ret.secret;
  return ret;
};

webhookEndpointSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
webhookEndpointSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const WebhookEndpoint =
  mongoose.models.WebhookEndpoint ?? mongoose.model('WebhookEndpoint', webhookEndpointSchema);
