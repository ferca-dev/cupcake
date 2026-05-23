import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

// Per-tenant subscription state. Cupcake mirrors the Mercado Pago preapproval
// resource here so the rest of the product (admin pages, reminder jobs, the
// public form gating story in later phases) can query a single document
// instead of hitting the Mercado Pago API.
//
// Statuses follow Mercado Pago semantics:
//   - `pending`: preapproval created but the payer has not authorised it.
//   - `authorized`: payer accepted, recurring charges will start.
//   - `paused`: charges suspended but the preapproval is still active.
//   - `cancelled`: explicitly cancelled by the user or admin.
//   - `expired`: Mercado Pago marked the preapproval as expired.
//
// `cancelAtPeriodEnd` lets a tenant request cancellation that takes effect at
// the end of the current period; we keep the preapproval authorised in
// Mercado Pago until the renewal date.

export const SUBSCRIPTION_STATUSES = Object.freeze([
  'pending',
  'authorized',
  'paused',
  'cancelled',
  'expired',
]);

const subscriptionSchema = new Schema(
  {
    tenantId: { type: Types.ObjectId, ref: 'Tenant', required: true, index: true },
    planId: { type: Types.ObjectId, ref: 'SubscriptionPlan', required: true },
    planCode: { type: String, required: true },
    planNameSnapshot: { type: String, required: true },
    includedTokens: { type: Number, default: 0, min: 0 },

    status: { type: String, enum: SUBSCRIPTION_STATUSES, default: 'pending', index: true },

    // Mercado Pago resource ids.
    mercadoPagoPreapprovalId: { type: String, default: null, index: true, sparse: true },
    mercadoPagoPayerEmail: { type: String, default: null },
    initPoint: { type: String, default: null },

    priceMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true },

    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    nextChargeAt: { type: Date, default: null, index: true },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    cancelledAt: { type: Date, default: null },
    authorizedAt: { type: Date, default: null },
    pausedAt: { type: Date, default: null },

    requestedBy: { type: Types.ObjectId, ref: 'User', default: null },
    externalReference: { type: String, required: true, unique: true, sparse: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: false },
);

subscriptionSchema.index({ tenantId: 1, status: 1 });
subscriptionSchema.index({ tenantId: 1, createdAt: -1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

subscriptionSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
subscriptionSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const TenantSubscription =
  mongoose.models.TenantSubscription ?? mongoose.model('TenantSubscription', subscriptionSchema);
