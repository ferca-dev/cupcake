import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

export const CUSTOM_DOMAIN_STATUSES = Object.freeze([
  'pending',
  'verified',
  'active',
  'inactive',
  'rejected',
]);

export const CUSTOM_DOMAIN_SSL_MODES = Object.freeze(['platform_managed', 'manual', 'external']);

const dnsRecordSchema = new Schema(
  {
    type: { type: String, enum: ['TXT'], default: 'TXT', required: true },
    name: { type: String, required: true, lowercase: true, trim: true },
    value: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const customDomainSchema = new Schema(
  {
    tenantId: { type: Types.ObjectId, ref: 'Tenant', required: true, index: true },
    hostname: { type: String, required: true, lowercase: true, trim: true },
    status: {
      type: String,
      enum: CUSTOM_DOMAIN_STATUSES,
      default: 'pending',
      required: true,
      index: true,
    },
    verificationToken: { type: String, required: true, trim: true },
    dnsRecord: { type: dnsRecordSchema, required: true },
    sslMode: {
      type: String,
      enum: CUSTOM_DOMAIN_SSL_MODES,
      default: 'platform_managed',
      required: true,
    },
    requestedByUserId: { type: Types.ObjectId, ref: 'User', default: null },
    reviewedByUserId: { type: Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
    activatedAt: { type: Date, default: null },
    deactivatedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    adminOverrideAt: { type: Date, default: null },
    lastCheckedAt: { type: Date, default: null },
    lastCheckError: { type: String, default: null, trim: true },
  },
  { timestamps: true, versionKey: false },
);

customDomainSchema.index(
  { hostname: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
customDomainSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
customDomainSchema.index({ status: 1, createdAt: -1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

customDomainSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
customDomainSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const CustomDomain =
  mongoose.models.CustomDomain ?? mongoose.model('CustomDomain', customDomainSchema);
