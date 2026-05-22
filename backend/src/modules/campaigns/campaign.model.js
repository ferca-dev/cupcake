import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

export const CAMPAIGN_CHANNELS = Object.freeze(['email', 'sms', 'whatsapp']);

export const CAMPAIGN_STATUSES = Object.freeze([
  'draft',
  'queued',
  'sending',
  'completed',
  'completed_with_errors',
  'failed',
]);

const summarySchema = new Schema(
  {
    selectedCount: { type: Number, default: 0 },
    validCount: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    skippedReasons: { type: Schema.Types.Mixed, default: () => ({}) },
    // Token economy snapshot for this campaign run. Captured at send time
    // and refreshed when refunds are applied so the campaign report can
    // surface accurate billing data without re-aggregating the ledger.
    tokenCost: { type: Number, default: 0, min: 0 },
    tokensCharged: { type: Number, default: 0, min: 0 },
    tokensRefunded: { type: Number, default: 0, min: 0 },
    tokensHeld: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const targetSchema = new Schema(
  {
    contactIds: {
      type: [{ type: Types.ObjectId, ref: 'Contact' }],
      default: () => [],
    },
    groupIds: {
      type: [{ type: Types.ObjectId, ref: 'ContactGroup' }],
      default: () => [],
    },
  },
  { _id: false },
);

const campaignSchema = new Schema(
  {
    tenantId: {
      type: Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    surveyId: {
      type: Types.ObjectId,
      ref: 'Survey',
      required: true,
      index: true,
    },
    surveyVersionId: {
      type: Types.ObjectId,
      ref: 'SurveyVersion',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    channels: {
      type: [{ type: String, enum: CAMPAIGN_CHANNELS }],
      default: () => [],
    },
    target: { type: targetSchema, default: () => ({}) },
    summary: { type: summarySchema, default: () => ({}) },
    status: {
      type: String,
      enum: CAMPAIGN_STATUSES,
      default: 'draft',
      required: true,
      index: true,
    },
    createdBy: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    scheduledAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

campaignSchema.index({ tenantId: 1, status: 1 });
campaignSchema.index({ tenantId: 1, surveyId: 1 });
campaignSchema.index({ tenantId: 1, createdAt: -1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

campaignSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
campaignSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const Campaign = mongoose.models.Campaign ?? mongoose.model('Campaign', campaignSchema);
