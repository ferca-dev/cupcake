import mongoose from 'mongoose';

const { Schema } = mongoose;

// Catalog of recurring plans available to tenants. Plans are global (not
// tenant-scoped) so super admins curate one catalogue. `includedTokens` is
// the number of tokens the wallet receives on each authorised renewal — the
// invoice handler runs through the same token ledger used by one-time
// purchases.

export const PLAN_STATUSES = Object.freeze(['active', 'inactive']);
export const PLAN_INTERVALS = Object.freeze(['months', 'years']);

const planSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: null, trim: true, maxlength: 500 },
    code: { type: String, required: true, trim: true, lowercase: true },
    priceMinor: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isInteger, message: 'priceMinor must be an integer' },
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{3}$/, 'currency must be a 3-letter ISO 4217 code'],
    },
    intervalCount: { type: Number, default: 1, min: 1 },
    intervalUnit: { type: String, enum: PLAN_INTERVALS, default: 'months' },
    includedTokens: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: PLAN_STATUSES, default: 'active', index: true },

    // Mercado Pago surfaces a `preapproval_plan` resource. When the integrator
    // wants to pre-create a plan in Mercado Pago and reuse its id, we store the
    // identifier here. Cupcake works both ways — with or without a server-side
    // plan — because preapprovals can also embed all plan data inline.
    mercadoPagoPlanId: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);

planSchema.index({ code: 1 }, { unique: true });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

planSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
planSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const SubscriptionPlan =
  mongoose.models.SubscriptionPlan ?? mongoose.model('SubscriptionPlan', planSchema);
