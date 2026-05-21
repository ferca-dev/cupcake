import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

const surveyVersionSchema = new Schema(
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
    versionNumber: { type: Number, required: true, min: 1 },
    schema: { type: Schema.Types.Mixed, required: true },
    publishedBy: { type: Types.ObjectId, ref: 'User', required: true },
    publishedAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

surveyVersionSchema.index({ surveyId: 1, versionNumber: 1 }, { unique: true });
surveyVersionSchema.index({ tenantId: 1, surveyId: 1, publishedAt: -1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

surveyVersionSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: toPublic,
});
surveyVersionSchema.set('toObject', {
  virtuals: true,
  versionKey: false,
  transform: toPublic,
});

export const SurveyVersion =
  mongoose.models.SurveyVersion ?? mongoose.model('SurveyVersion', surveyVersionSchema);
