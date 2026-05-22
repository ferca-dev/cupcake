import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

export const TOKEN_PACKAGE_STATUSES = Object.freeze(['active', 'inactive']);

// Token packages are global, super-admin-curated offers. Clients pick a
// package to request more tokens; the displayed price is recorded in integer
// minor currency units (e.g. cents) so a real payment provider can use the
// same value later without lossy decimal conversion.
const ISO_CURRENCY_REGEX = /^[A-Z]{3}$/;

const tokenPackageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: null, trim: true, maxlength: 500 },
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
      enum: TOKEN_PACKAGE_STATUSES,
      default: 'active',
      index: true,
    },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

tokenPackageSchema.index({ status: 1, sortOrder: 1, createdAt: 1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

tokenPackageSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
tokenPackageSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const TokenPackage =
  mongoose.models.TokenPackage ?? mongoose.model('TokenPackage', tokenPackageSchema);
