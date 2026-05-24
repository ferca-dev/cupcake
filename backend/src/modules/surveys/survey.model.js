import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

export const SURVEY_STATUSES = Object.freeze(['draft', 'published', 'paused', 'archived']);

export const PUBLIC_SURVEY_STATUSES = Object.freeze(['published', 'paused']);

export const RESPONSE_LIMIT_MODES = Object.freeze([
  'unlimited',
  'one_per_contact',
  'one_per_device',
  'one_per_ip',
]);

export const DEFAULT_RESPONSE_LIMIT_MESSAGE = 'This survey has already been answered.';

export const ANTI_ABUSE_SUSPICIOUS_ACTIONS = Object.freeze(['reject', 'flag']);

const antiAbuseSettingsSchema = new Schema(
  {
    // When true the public form must include a verified CAPTCHA token.
    captchaRequired: { type: Boolean, default: false },
    // When true the rendered form embeds an invisible honeypot field and
    // rejects any submission whose honeypot value is non-empty.
    honeypotEnabled: { type: Boolean, default: true },
    // Floor for "time spent on the form" before a submission is allowed.
    // null/0 lets the global env floor apply. Set per-survey only when the
    // tenant needs a stricter bar than the platform default.
    minFillSeconds: { type: Number, default: null, min: 0, max: 600 },
    // Per-survey override for the per-IP burst limit. null falls back to the
    // global env value (`PUBLIC_FORM_RATE_LIMIT_PER_IP_PER_MINUTE`).
    perIpPerMinute: { type: Number, default: null, min: 0, max: 100_000 },
    // Per-token override (campaign submission tokens). Same fallback rule.
    perTokenPerMinute: { type: Number, default: null, min: 0, max: 100_000 },
    // How the service treats a flagged submission. `reject` (default) blocks
    // the request and surfaces a generic error. `flag` lets the response
    // through but writes a `suspicious_submissions` record so abuse can be
    // reviewed without losing data.
    suspiciousAction: {
      type: String,
      enum: ANTI_ABUSE_SUSPICIOUS_ACTIONS,
      default: 'reject',
    },
  },
  { _id: false },
);

const responseLimitSchema = new Schema(
  {
    mode: {
      type: String,
      enum: RESPONSE_LIMIT_MODES,
      default: 'unlimited',
    },
    deviceKeyRequired: { type: Boolean, default: false },
    ipRequired: { type: Boolean, default: false },
    message: { type: String, default: DEFAULT_RESPONSE_LIMIT_MESSAGE },
  },
  { _id: false },
);

const locationCaptureSchema = new Schema(
  {
    mode: {
      type: String,
      enum: ['disabled', 'optional', 'required', 'required_for_surveyors'],
      default: 'optional',
    },
    minimumAccuracyMeters: { type: Number, default: 100 },
    allowIpFallback: { type: Boolean, default: true },
    storeRawIp: { type: Boolean, default: false },
    requiredMessage: {
      type: String,
      default: 'Location is required to submit this survey.',
    },
  },
  { _id: false },
);

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
    // Legacy boolean kept for backwards-compatibility; `responseLimit.mode`
    // is the authoritative value going forward.
    oneResponsePerContact: { type: Boolean, default: false },
    collectIp: { type: Boolean, default: false },
    responseLimit: { type: responseLimitSchema, default: () => ({}) },
    antiAbuse: { type: antiAbuseSettingsSchema, default: () => ({}) },
    locationCapture: { type: locationCaptureSchema, default: () => ({}) },
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
