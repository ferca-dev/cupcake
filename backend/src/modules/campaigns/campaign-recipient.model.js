import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

export const CAMPAIGN_RECIPIENT_STATUSES = Object.freeze([
  'pending',
  'sent',
  'failed',
  'skipped',
  'delivered',
  'opened',
  'clicked',
]);

export const CAMPAIGN_RECIPIENT_CHANNELS = Object.freeze(['email', 'sms', 'whatsapp']);

export const SKIP_REASONS = Object.freeze([
  'missing_email',
  'invalid_email',
  'missing_phone',
  'invalid_phone',
  'missing_whatsapp_phone',
  'invalid_whatsapp_phone',
  'contact_blocked',
  'contact_archived',
  'duplicate_recipient',
]);

const campaignRecipientSchema = new Schema(
  {
    tenantId: {
      type: Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    campaignId: {
      type: Types.ObjectId,
      ref: 'Campaign',
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
    },
    contactId: {
      type: Types.ObjectId,
      ref: 'Contact',
      default: null,
      index: true,
    },
    channel: {
      type: String,
      enum: CAMPAIGN_RECIPIENT_CHANNELS,
      required: true,
    },
    recipient: { type: String, default: null, trim: true, maxlength: 200 },
    status: {
      type: String,
      enum: CAMPAIGN_RECIPIENT_STATUSES,
      default: 'pending',
      required: true,
      index: true,
    },
    skippedReason: { type: String, default: null },
    failureReason: { type: String, default: null },
    submissionToken: { type: String, required: true },
    publicUrl: { type: String, required: true },
    provider: { type: String, default: null },
    providerMessageId: { type: String, default: null },
    sentAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    openedAt: { type: Date, default: null },
    clickedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

campaignRecipientSchema.index({ tenantId: 1, campaignId: 1, status: 1 });
campaignRecipientSchema.index({ campaignId: 1, channel: 1, contactId: 1 });
campaignRecipientSchema.index({ campaignId: 1, channel: 1, recipient: 1 });
campaignRecipientSchema.index({ submissionToken: 1 }, { unique: true });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

campaignRecipientSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
campaignRecipientSchema.set('toObject', {
  virtuals: true,
  versionKey: false,
  transform: toPublic,
});

export const CampaignRecipient =
  mongoose.models.CampaignRecipient ?? mongoose.model('CampaignRecipient', campaignRecipientSchema);
