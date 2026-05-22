import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

export const TOKEN_LEDGER_TYPES = Object.freeze([
  'credit',
  'debit',
  'refund',
  'adjustment_credit',
  'adjustment_debit',
  'purchase',
]);

export const TOKEN_LEDGER_REFERENCES = Object.freeze([
  'campaign_recipient',
  'campaign',
  'manual_adjustment',
  'token_purchase',
  'system',
]);

export const TOKEN_LEDGER_CHANNELS = Object.freeze(['email', 'sms', 'whatsapp']);

// Immutable ledger entry. Each balance change on a wallet creates exactly one
// entry. `amount` is always a non-negative integer; the sign of the movement
// is conveyed by `type`. `balanceAfter` is captured at write time so the
// running balance can be reconstructed without recomputing the full history.
const tokenLedgerEntrySchema = new Schema(
  {
    tenantId: {
      type: Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: TOKEN_LEDGER_TYPES,
      required: true,
      index: true,
    },
    channel: {
      type: String,
      enum: TOKEN_LEDGER_CHANNELS,
      default: null,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'amount must be an integer token count',
      },
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'balanceAfter must be an integer',
      },
    },
    referenceType: {
      type: String,
      enum: TOKEN_LEDGER_REFERENCES,
      default: 'system',
    },
    referenceId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 80,
    },
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    createdBy: {
      type: Types.ObjectId,
      ref: 'User',
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

tokenLedgerEntrySchema.index({ tenantId: 1, createdAt: -1 });
tokenLedgerEntrySchema.index({ tenantId: 1, type: 1, createdAt: -1 });
tokenLedgerEntrySchema.index({ tenantId: 1, referenceType: 1, referenceId: 1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

tokenLedgerEntrySchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
tokenLedgerEntrySchema.set('toObject', {
  virtuals: true,
  versionKey: false,
  transform: toPublic,
});

export const TokenLedgerEntry =
  mongoose.models.TokenLedgerEntry ?? mongoose.model('TokenLedgerEntry', tokenLedgerEntrySchema);
