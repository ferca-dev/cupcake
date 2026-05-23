import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

const TENANT_STATUSES = ['active', 'suspended', 'cancelled'];

const brandingSchema = new Schema(
  {
    logoUrl: { type: String, default: null },
    primaryColor: { type: String, default: null },
  },
  { _id: false },
);

const settingsSchema = new Schema(
  {
    timezone: { type: String, default: 'UTC' },
    locale: { type: String, default: 'en-US' },
    branding: { type: brandingSchema, default: () => ({}) },
    // Maximum number of active tenant members allowed (admins + members +
    // surveyors). `null` means unlimited. Super admins manage this from the
    // tenant detail UI until plans drive it natively.
    maxTeamMembers: { type: Number, default: null, min: 1 },
  },
  { _id: false },
);

const tenantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    ownerUserId: { type: Types.ObjectId, ref: 'User', default: null },
    status: {
      type: String,
      enum: TENANT_STATUSES,
      default: 'active',
      required: true,
    },
    planId: { type: Types.ObjectId, default: null },
    settings: { type: settingsSchema, default: () => ({}) },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

tenantSchema.index({ slug: 1 }, { unique: true });
tenantSchema.index({ ownerUserId: 1 });
tenantSchema.index({ status: 1 });

tenantSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    return ret;
  },
});

export const TENANT_STATUS_VALUES = TENANT_STATUSES;

export const Tenant = mongoose.models.Tenant ?? mongoose.model('Tenant', tenantSchema);
