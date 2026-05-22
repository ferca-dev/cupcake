import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

// Aggregated send counters per tenant per UTC month, used to enforce
// `tenant_send_limits` in O(1) without scanning the ledger. The document is
// updated atomically with `$inc` whenever a debit or refund changes the
// effective send count.
const monthlySendUsageSchema = new Schema(
  {
    tenantId: {
      type: Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    // 'YYYY-MM' formatted UTC year-month.
    yearMonth: { type: String, required: true, trim: true, maxlength: 7 },
    total: { type: Number, default: 0, min: 0 },
    perChannel: {
      email: { type: Number, default: 0, min: 0 },
      sms: { type: Number, default: 0, min: 0 },
      whatsapp: { type: Number, default: 0, min: 0 },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

monthlySendUsageSchema.index({ tenantId: 1, yearMonth: 1 }, { unique: true });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

monthlySendUsageSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
monthlySendUsageSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const MonthlySendUsage =
  mongoose.models.MonthlySendUsage ?? mongoose.model('MonthlySendUsage', monthlySendUsageSchema);

export const currentYearMonth = (date = new Date()) => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};
