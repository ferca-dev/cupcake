import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

export const SUSPICIOUS_SUBMISSION_REASONS = Object.freeze([
  'honeypot_filled',
  'captcha_missing',
  'captcha_invalid',
  'captcha_misconfigured',
  'rate_limit_ip',
  'rate_limit_survey',
  'rate_limit_tenant',
  'rate_limit_token',
  'too_fast',
]);

const suspiciousSubmissionSchema = new Schema(
  {
    tenantId: { type: Types.ObjectId, ref: 'Tenant', default: null, index: true },
    surveyId: { type: Types.ObjectId, ref: 'Survey', default: null, index: true },
    surveySlug: { type: String, default: null },
    submissionToken: { type: String, default: null },
    // Raw IP is intentionally stored (truncated by the service) so abuse
    // reviewers can correlate bursts; hashed IPs are kept alongside for
    // privacy-preserving aggregation regardless of the survey collectIp
    // setting.
    ip: { type: String, default: null },
    ipHash: { type: String, default: null },
    userAgent: { type: String, default: null },
    reason: {
      type: String,
      enum: SUSPICIOUS_SUBMISSION_REASONS,
      required: true,
      index: true,
    },
    // Whether the suspicious submission was blocked or merely flagged. `flag`
    // means the request was allowed through (because the survey opted into
    // `suspiciousAction: 'flag'`).
    action: { type: String, enum: ['reject', 'flag'], required: true },
    details: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

suspiciousSubmissionSchema.index({ tenantId: 1, createdAt: -1 });
suspiciousSubmissionSchema.index({ surveyId: 1, createdAt: -1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

suspiciousSubmissionSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
suspiciousSubmissionSchema.set('toObject', {
  virtuals: true,
  versionKey: false,
  transform: toPublic,
});

export const SuspiciousSubmission =
  mongoose.models.SuspiciousSubmission ??
  mongoose.model('SuspiciousSubmission', suspiciousSubmissionSchema);
