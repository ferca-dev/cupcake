import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

export const SUPPRESSION_CHANNELS = Object.freeze(['email', 'sms', 'whatsapp']);

export const SUPPRESSION_REASONS = Object.freeze([
  'manual',
  'unsubscribe',
  'sms_stop',
  'whatsapp_opt_out',
  'provider',
  'legal',
  'bounce',
  'complaint',
  'other',
]);

export const SUPPRESSION_SOURCES = Object.freeze([
  'manual',
  'email_unsubscribe',
  'twilio',
  'sendgrid',
  'whatsapp',
  'provider',
  'import',
  'system',
]);

export const SUPPRESSION_STATUSES = Object.freeze(['active', 'inactive']);

const suppressionListSchema = new Schema(
  {
    tenantId: {
      type: Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    channel: {
      type: String,
      enum: SUPPRESSION_CHANNELS,
      required: true,
      index: true,
    },
    value: { type: String, required: true, trim: true, maxlength: 200 },
    email: { type: String, default: null, trim: true, lowercase: true, maxlength: 200 },
    phone: { type: String, default: null, trim: true, maxlength: 40 },
    whatsappPhone: { type: String, default: null, trim: true, maxlength: 40 },
    reason: {
      type: String,
      enum: SUPPRESSION_REASONS,
      default: 'manual',
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: SUPPRESSION_SOURCES,
      default: 'manual',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: SUPPRESSION_STATUSES,
      default: 'active',
      required: true,
      index: true,
    },
    suppressedAt: { type: Date, default: Date.now },
    releasedAt: { type: Date, default: null },
    createdBy: { type: Types.ObjectId, ref: 'User', default: null },
    releasedBy: { type: Types.ObjectId, ref: 'User', default: null },
    metadata: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

suppressionListSchema.index({ tenantId: 1, channel: 1, value: 1, status: 1 });
suppressionListSchema.index(
  { tenantId: 1, channel: 1, value: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } },
);
suppressionListSchema.index({ tenantId: 1, createdAt: -1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

suppressionListSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
suppressionListSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const SuppressionListEntry =
  mongoose.models.SuppressionListEntry ??
  mongoose.model('SuppressionListEntry', suppressionListSchema);
