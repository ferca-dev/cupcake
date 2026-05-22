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
    // Hash of the IP, only persisted for surveys whose responseLimit mode is
    // `one_per_ip`. Backs the partial-unique index that closes the race
    // window between the duplicate-check query and the actual insert.
    ipHash: { type: String, default: null },
    userAgent: { type: String, default: null },
    // Hash of the anonymous device key the public form generates. Only
    // persisted when responseLimit.mode === 'one_per_device' so other modes
    // never collide on the partial-unique index.
    deviceKeyHash: { type: String, default: null },
    // Hash of the contact identifier (contactId / submissionToken) for
    // `one_per_contact` enforcement. Stored separately from `contactId` so
    // campaign reporting (which keeps `contactId` for every linked response)
    // never collides with the partial-unique index.
    contactKeyHash: { type: String, default: null },
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
// Campaign reporting groups responses by campaign in time order.
responseSchema.index({ campaignId: 1, createdAt: -1 });
// Sparse unique indexes back the response-limit checks. A second write that
// would create a duplicate fails with a Mongo duplicate-key error, which the
// service layer maps to a conflict — this closes the race window between the
// pre-write count check and the actual insert.
responseSchema.index(
  { surveyId: 1, 'metadata.deviceKeyHash': 1 },
  {
    unique: true,
    partialFilterExpression: { 'metadata.deviceKeyHash': { $type: 'string' } },
    name: 'unique_survey_device_key',
  },
);
responseSchema.index(
  { surveyId: 1, 'metadata.ipHash': 1 },
  {
    unique: true,
    partialFilterExpression: { 'metadata.ipHash': { $type: 'string' } },
    name: 'unique_survey_ip_hash',
  },
);
responseSchema.index(
  { surveyId: 1, 'metadata.contactKeyHash': 1 },
  {
    unique: true,
    partialFilterExpression: { 'metadata.contactKeyHash': { $type: 'string' } },
    name: 'unique_survey_contact_key',
  },
);

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

responseSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
responseSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const Response = mongoose.models.Response ?? mongoose.model('Response', responseSchema);
