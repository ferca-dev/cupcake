import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

export const TOKEN_PURCHASE_STATUSES = Object.freeze([
  'pending',
  'approved',
  'rejected',
  'completed',
  'cancelled',
]);

const ISO_CURRENCY_REGEX = /^[A-Z]{3}$/;

// Token purchase request. The flow has two modes:
//   - `manual` (default): clients submit a request, the tenant wallet is
//     unaffected until a super admin approves. On approval, the package
//     tokens are credited via a `purchase` ledger entry and the purchase is
//     marked `completed`.
//   - real payment provider (future): clients pay through a provider; the
//     provider callback flips the purchase to `completed` and credits the
//     wallet. The model already carries `paymentProvider`/`paymentReference`
//     so wiring a provider does not require a migration.
const tokenPurchaseSchema = new Schema(
  {
    tenantId: {
      type: Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    packageId: {
      type: Types.ObjectId,
      ref: 'TokenPackage',
      default: null,
    },
    // Package data is snapshotted so historical purchases survive package
    // edits or deletions.
    packageName: { type: String, required: true, trim: true, maxlength: 120 },
    tokens: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'tokens must be a positive integer',
      },
    },
    priceMinor: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'priceMinor must be an integer (minor currency units)',
      },
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      match: [ISO_CURRENCY_REGEX, 'currency must be a 3-letter ISO 4217 code'],
    },
    status: {
      type: String,
      enum: TOKEN_PURCHASE_STATUSES,
      default: 'pending',
      index: true,
    },
    paymentProvider: { type: String, default: null, trim: true, maxlength: 80 },
    paymentReference: { type: String, default: null, trim: true, maxlength: 160 },
    requestedBy: { type: Types.ObjectId, ref: 'User', default: null },
    decidedBy: { type: Types.ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
    decisionNotes: { type: String, default: null, trim: true, maxlength: 500 },
    ledgerEntryId: { type: Types.ObjectId, ref: 'TokenLedgerEntry', default: null },
    notes: { type: String, default: null, trim: true, maxlength: 500 },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

tokenPurchaseSchema.index({ tenantId: 1, createdAt: -1 });
tokenPurchaseSchema.index({ tenantId: 1, status: 1 });
tokenPurchaseSchema.index({ status: 1, createdAt: -1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

tokenPurchaseSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
tokenPurchaseSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const TokenPurchase =
  mongoose.models.TokenPurchase ?? mongoose.model('TokenPurchase', tokenPurchaseSchema);
