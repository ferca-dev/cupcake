import mongoose from 'mongoose';

import { PLAN_STATUSES, FEATURE_KEY_VALUES, QUOTA_KEY_VALUES } from './plan.constants.js';

const { Schema } = mongoose;

/**
 * Product packaging plan. Distinct from `SubscriptionPlan`, which models a
 * Mercado Pago preapproval. A `Plan` may optionally reference a subscription
 * plan so an admin can wire pricing + recurring billing together, but the
 * product surface (feature gates and quotas) is driven by this record alone.
 *
 * `features` and `quotas` are stored as plain objects keyed by the constants
 * in `plan.constants.js`. Unknown keys are stripped on read so renaming a key
 * does not silently keep granting a removed feature.
 *
 * Quota values are integers. `null` (or a missing key) means **unlimited**.
 */

const priceSchema = new Schema(
  {
    amountMinor: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'USD', uppercase: true, trim: true },
    intervalUnit: { type: String, enum: ['months', 'years'], default: 'months' },
    intervalCount: { type: Number, default: 1, min: 1 },
  },
  { _id: false },
);

const planSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    code: { type: String, required: true, trim: true, lowercase: true, maxlength: 60 },
    description: { type: String, default: null, trim: true, maxlength: 500 },
    status: { type: String, enum: PLAN_STATUSES, default: 'draft', required: true },
    isDefault: { type: Boolean, default: false },
    price: { type: priceSchema, default: () => ({}) },

    // We use `Schema.Types.Mixed` instead of a `Map` so the documents serialise
    // cleanly via `toJSON` without Map-to-object hoops in the controller. The
    // service layer normalises the contents on every write.
    features: { type: Schema.Types.Mixed, default: () => ({}) },
    quotas: { type: Schema.Types.Mixed, default: () => ({}) },

    // Optional link to a Mercado Pago recurring plan. When set, assigning this
    // plan to a tenant can suggest a subscription flow in the UI.
    subscriptionPlanId: {
      type: Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      default: null,
    },

    sortOrder: { type: Number, default: 0 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

planSchema.index({ code: 1 }, { unique: true });
planSchema.index({ status: 1 });
planSchema.index({ isDefault: 1 });
planSchema.index({ sortOrder: 1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

planSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
planSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

/**
 * Returns a sanitised view of `features` containing only known keys with
 * boolean values. Used by the service so the runtime never sees a stale key.
 */
planSchema.methods.normalizedFeatures = function normalizedFeatures() {
  const raw =
    this.features && typeof this.features === 'object' && !Array.isArray(this.features)
      ? this.features
      : {};
  const out = {};
  for (const key of FEATURE_KEY_VALUES) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      out[key] = Boolean(raw[key]);
    }
  }
  return out;
};

/**
 * Returns a sanitised view of `quotas` containing only known keys with
 * integer or null values. `null` (or missing) means unlimited.
 */
planSchema.methods.normalizedQuotas = function normalizedQuotas() {
  const raw =
    this.quotas && typeof this.quotas === 'object' && !Array.isArray(this.quotas)
      ? this.quotas
      : {};
  const out = {};
  for (const key of QUOTA_KEY_VALUES) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      const value = raw[key];
      if (value === null || value === undefined) {
        out[key] = null;
      } else if (Number.isFinite(Number(value))) {
        out[key] = Math.max(0, Math.floor(Number(value)));
      }
    }
  }
  return out;
};

export const Plan = mongoose.models.Plan ?? mongoose.model('Plan', planSchema);
