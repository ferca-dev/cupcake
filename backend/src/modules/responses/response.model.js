import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

const answerSchema = new Schema(
  {
    fieldId: { type: String, required: true },
    key: { type: String, default: null },
    type: { type: String, required: true },
    value: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const metadataSchema = new Schema(
  {
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    startedAt: { type: Date, default: null },
    submittedAt: { type: Date, required: true },
    completionTimeSeconds: { type: Number, default: null },
  },
  { _id: false },
);

const responseSchema = new Schema(
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
    campaignId: {
      type: Types.ObjectId,
      ref: 'Campaign',
      default: null,
    },
    campaignRecipientId: {
      type: Types.ObjectId,
      ref: 'CampaignRecipient',
      default: null,
    },
    contactId: {
      type: Types.ObjectId,
      ref: 'Contact',
      default: null,
    },
    submissionToken: { type: String, default: null, index: true },
    answers: { type: [answerSchema], default: [] },
    metadata: { type: metadataSchema, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

responseSchema.index({ tenantId: 1, surveyId: 1, createdAt: -1 });
responseSchema.index({ surveyVersionId: 1, createdAt: -1 });
responseSchema.index({ campaignRecipientId: 1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

responseSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
responseSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const Response = mongoose.models.Response ?? mongoose.model('Response', responseSchema);
