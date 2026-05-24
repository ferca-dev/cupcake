import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

export const CONTACT_IMPORT_JOB_STATUSES = Object.freeze([
  'uploaded',
  'previewed',
  'mapped',
  'processing',
  'completed',
  'failed',
]);

const countSchema = new Schema(
  {
    totalRows: { type: Number, default: 0 },
    acceptedRows: { type: Number, default: 0 },
    rejectedRows: { type: Number, default: 0 },
    duplicateRows: { type: Number, default: 0 },
    createdRows: { type: Number, default: 0 },
    updatedRows: { type: Number, default: 0 },
    skippedRows: { type: Number, default: 0 },
  },
  { _id: false },
);

const fileSchema = new Schema(
  {
    originalName: { type: String, required: true },
    mimeType: { type: String, default: null },
    size: { type: Number, required: true },
    format: { type: String, enum: ['csv', 'xlsx'], required: true },
    checksum: { type: String, required: true },
    rowCount: { type: Number, default: 0 },
  },
  { _id: false },
);

const importErrorSchema = new Schema(
  {
    rowNumber: { type: Number, required: true },
    field: { type: String, default: null },
    message: { type: String, required: true },
    value: { type: String, default: null },
  },
  { _id: false },
);

const stagedRowSchema = new Schema(
  {
    rowNumber: { type: Number, required: true },
    values: { type: [String], default: () => [] },
  },
  { _id: false },
);

const contactImportJobSchema = new Schema(
  {
    tenantId: {
      type: Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    requestedBy: { type: Types.ObjectId, ref: 'User', default: null },
    confirmedBy: { type: Types.ObjectId, ref: 'User', default: null },
    status: {
      type: String,
      enum: CONTACT_IMPORT_JOB_STATUSES,
      default: 'uploaded',
      required: true,
      index: true,
    },
    file: { type: fileSchema, required: true },
    headers: { type: [String], default: () => [] },
    sampleRows: { type: [Schema.Types.Mixed], default: () => [] },
    rows: { type: [stagedRowSchema], default: () => [], select: false },
    mapping: { type: Schema.Types.Mixed, default: () => ({}) },
    suggestedMapping: { type: Schema.Types.Mixed, default: () => ({}) },
    dedupeKeys: { type: [String], default: () => ['email', 'phone', 'whatsappPhone'] },
    updateExisting: { type: Boolean, default: true },
    counts: { type: countSchema, default: () => ({}) },
    rowErrors: { type: [importErrorSchema], default: () => [] },
    errorReportGeneratedAt: { type: Date, default: null },
    confirmedAt: { type: Date, default: null },
    processedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    failureMessage: { type: String, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

contactImportJobSchema.index({ tenantId: 1, createdAt: -1 });
contactImportJobSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  delete ret.rows;
  return ret;
};

contactImportJobSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
contactImportJobSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const ContactImportJob =
  mongoose.models.ContactImportJob ?? mongoose.model('ContactImportJob', contactImportJobSchema);
