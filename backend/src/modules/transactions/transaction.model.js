import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

export const TRANSACTION_TYPES = Object.freeze(['payment', 'refund', 'credit', 'adjustment']);

export const TRANSACTION_STATUSES = Object.freeze([
  'pending',
  'paid',
  'failed',
  'refunded',
  'cancelled',
]);

// ISO 4217 codes are uppercase three-letter strings. The schema keeps the
// validation loose enough for any future provider currency while preventing
// obviously invalid values.
const ISO_CURRENCY_REGEX = /^[A-Z]{3}$/;

const transactionSchema = new Schema(
  {
    tenantId: {
      type: Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: TRANSACTION_TYPES,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: TRANSACTION_STATUSES,
      required: true,
      default: 'pending',
      index: true,
    },
    // Amount is stored as integer minor units (e.g. cents for USD, centavos
    // for MXN) so providers like Stripe and MercadoPago can be plugged in
    // later without lossy decimal conversion. Currency is mandatory and the
    // pair (amount, currency) is the source of truth for the displayed value.
    amount: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'amount must be an integer (minor currency units)',
      },
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      match: [ISO_CURRENCY_REGEX, 'currency must be a 3-letter ISO 4217 code'],
    },
    // Adapter identifier for the future payment provider (e.g. `stripe`,
    // `mercadopago`). Nullable while no real provider is wired up — the
    // value is intentionally opaque to the rest of the domain.
    provider: {
      type: String,
      default: null,
      trim: true,
    },
    // Provider-side reference (charge id, payment intent id, etc.). Indexed
    // because reconciliation jobs will look transactions up by this value.
    providerReference: {
      type: String,
      default: null,
      trim: true,
    },
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    // Optional reference to a billing plan. Plans are not modelled yet, so the
    // field stores the plan's identifier as a string slug (e.g. `pro_monthly`)
    // — when the plans entity ships this field can transition to ObjectId
    // without breaking existing data.
    planCode: {
      type: String,
      default: null,
      trim: true,
      maxlength: 80,
    },
    paidAt: { type: Date, default: null },
    // Optional pointer to the user who triggered the transaction (e.g. the
    // tenant admin who upgraded the plan). Not required because automated
    // refunds may not have a user attached.
    initiatedBy: {
      type: Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

transactionSchema.index({ tenantId: 1, createdAt: -1 });
transactionSchema.index({ tenantId: 1, status: 1 });
transactionSchema.index({ tenantId: 1, type: 1 });
transactionSchema.index(
  { providerReference: 1 },
  { sparse: true, partialFilterExpression: { providerReference: { $type: 'string' } } },
);

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

transactionSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
transactionSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const Transaction =
  mongoose.models.Transaction ?? mongoose.model('Transaction', transactionSchema);
