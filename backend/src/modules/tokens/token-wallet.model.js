import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

// One wallet per tenant. Balance is stored as a signed integer count of
// prepaid tokens and is the live, authoritative figure used for preflight
// checks. Token movement is performed via the conditional `$inc` pattern in
// the token service so debits cannot drop below zero under concurrency.
const tokenWalletSchema = new Schema(
  {
    tenantId: {
      type: Types.ObjectId,
      ref: 'Tenant',
      required: true,
      unique: true,
      index: true,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'balance must be an integer token count',
      },
    },
    // Cumulative counters help reconciliation against the ledger. They are
    // monotonic — refunds increment `lifetimeRefunded` rather than reducing
    // `lifetimeDebited` so audits can compare both totals independently.
    lifetimeCredited: { type: Number, default: 0, min: 0 },
    lifetimeDebited: { type: Number, default: 0, min: 0 },
    lifetimeRefunded: { type: Number, default: 0, min: 0 },
    lastEventAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

tokenWalletSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
tokenWalletSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const TokenWallet =
  mongoose.models.TokenWallet ?? mongoose.model('TokenWallet', tokenWalletSchema);
