import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

export const SURVEY_STATUSES = Object.freeze(['draft', 'published', 'paused', 'archived']);

export const PUBLIC_SURVEY_STATUSES = Object.freeze(['published', 'paused']);

const surveySettingsSchema = new Schema(
  {
    allowAnonymous: { type: Boolean, default: true },
    requireContactData: { type: Boolean, default: false },
    thankYouMessage: { type: String, default: 'Thank you for your response.' },
    closeMessage: {
      type: String,
      default: 'This survey is no longer accepting responses.',
    },
    pausedMessage: {
      type: String,
      default: 'This survey is temporarily paused.',
    },
    oneResponsePerContact: { type: Boolean, default: false },
    collectIp: { type: Boolean, default: false },
  },
  { _id: false },
);

const surveySchema = new Schema(
  {
    tenantId: {
      type: Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: null, trim: true, maxlength: 1000 },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      maxlength: 80,
    },
    status: {
      type: String,
      enum: SURVEY_STATUSES,
      default: 'draft',
      required: true,
      index: true,
    },
    currentDraftSchema: { type: Schema.Types.Mixed, default: null },
    publishedVersionId: {
      type: Types.ObjectId,
      ref: 'SurveyVersion',
      default: null,
    },
    settings: { type: surveySettingsSchema, default: () => ({}) },
    createdBy: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    updatedBy: { type: Types.ObjectId, ref: 'User', default: null },
    publishedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

surveySchema.index({ slug: 1 }, { unique: true });
surveySchema.index({ tenantId: 1, status: 1 });
surveySchema.index({ tenantId: 1, createdAt: -1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

surveySchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
surveySchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const Survey = mongoose.models.Survey ?? mongoose.model('Survey', surveySchema);
