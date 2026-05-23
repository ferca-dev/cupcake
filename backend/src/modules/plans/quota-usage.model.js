import mongoose from 'mongoose';

import { QUOTA_PERIODS } from './plan.constants.js';

const { Schema, Types } = mongoose;

/**
 * Stores per-tenant quota counters. Two flavours:
 *
 *   - `monthly`: one row per (tenant, key, `YYYY-MM`). Incremented atomically
 *     by the feature gate when an event consumes the quota. Old months are
 *     retained for analytics; the live check only ever looks at the current
 *     month row.
 *   - `lifetime`: one row per (tenant, key). Used for derived counters that
 *     do not need a real-time increment, but where snapshots can be cached.
 *
 * A unique compound index on `(tenantId, key, periodKey)` guarantees the
 * upsert+`$inc` operation is race-safe.
 */
const usageSchema = new Schema(
  {
    tenantId: { type: Types.ObjectId, ref: 'Tenant', required: true, index: true },
    key: { type: String, required: true, trim: true },
    period: {
      type: String,
      enum: Object.values(QUOTA_PERIODS),
      default: QUOTA_PERIODS.MONTHLY,
      required: true,
    },
    periodKey: { type: String, required: true, trim: true }, // 'YYYY-MM' or 'lifetime'
    usage: { type: Number, default: 0, min: 0 },
    lastIncrementedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

usageSchema.index({ tenantId: 1, key: 1, periodKey: 1 }, { unique: true });
usageSchema.index({ tenantId: 1, key: 1, period: 1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

usageSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
usageSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const QuotaUsage = mongoose.models.QuotaUsage ?? mongoose.model('QuotaUsage', usageSchema);
