import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

export const SEND_LIMIT_ENFORCEMENTS = Object.freeze(['hard', 'soft']);
export const SEND_LIMIT_CHANNELS = Object.freeze(['email', 'sms', 'whatsapp']);

// Per-tenant send limits. `monthlyTotal` and the per-channel monthly fields
// can each be set to `null` to mean "no limit". `enforcement: 'hard'` blocks
// the send when exceeded; `'soft'` only flags it in metadata so admins can
// review without breaking production traffic.
const tenantSendLimitSchema = new Schema(
  {
    tenantId: {
      type: Types.ObjectId,
      ref: 'Tenant',
      required: true,
      unique: true,
      index: true,
    },
    monthlyTotal: {
      type: Number,
      default: null,
      min: 0,
      validate: {
        validator: (value) => value === null || Number.isInteger(value),
        message: 'monthlyTotal must be a non-negative integer or null',
      },
    },
    monthlyPerChannel: {
      email: { type: Number, default: null, min: 0 },
      sms: { type: Number, default: null, min: 0 },
      whatsapp: { type: Number, default: null, min: 0 },
    },
    enforcement: {
      type: String,
      enum: SEND_LIMIT_ENFORCEMENTS,
      default: 'hard',
    },
    updatedBy: { type: Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, default: null, trim: true, maxlength: 500 },
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

tenantSendLimitSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
tenantSendLimitSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const TenantSendLimit =
  mongoose.models.TenantSendLimit ?? mongoose.model('TenantSendLimit', tenantSendLimitSchema);
